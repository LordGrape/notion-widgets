"""Scan station: photographed textbook readings -> the Notion Source Library.

Drop a scan (a PDF from the iPhone scanner, or a folder of photos) into the watched folder. For
each scan the station splits two-page spreads, reads every page with TeleOCR on the GPU, takes the
printed page numbers from the running heads, matches the page range to the lecture that assigns
it, and files the reading through the Worker (which holds the Notion token). Filed scans move to
"Filed"; anything it cannot file moves to "Needs attention" with a note.

    python scan_station.py setup              choose the folder and enter the widget key once
    python scan_station.py run                watch the folder (what the startup shortcut runs)
    python scan_station.py process FILE [--dry-run]   one scan; --dry-run writes JSON, files nothing
"""
from __future__ import annotations

import argparse, datetime as dt, getpass, io, json, math, os, re, shutil, sys, time, traceback
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "ScanStation"
CONFIG = APP_DIR / "config.json"
INBOX = APP_DIR / "inbox.json"  # scan path -> Command Centre upload id
VERSION = "2026.10.03"
LOG = APP_DIR / "scan-station.log"
WORKER = "https://widget-sync.lordgrape-widgets.workers.dev"
MODEL = "StarDoc-AI/TeleOCR"
PROMPT = "Please output the text content from the image."
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".tif", ".tiff"}
UNCERTAIN = 0.30  # a word whose least-likely token falls under this probability is flagged


def log(message: str) -> None:
    line = f"{dt.datetime.now():%Y-%m-%d %H:%M:%S}  {message}"
    print(line, flush=True)
    APP_DIR.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(line + "\n")


# ---------- pages ----------
def load_images(path: Path) -> list[Image.Image]:
    """Every page image in a scan, in order."""
    if path.is_dir():
        files = sorted(p for p in path.iterdir() if p.suffix.lower() in IMAGE_TYPES)
        return [open_image(p) for p in files]
    if path.suffix.lower() == ".pdf":
        import pymupdf as fitz

        images = []
        with fitz.open(path) as doc:
            for page in doc:
                embedded = page.get_images(full=True)
                if len(embedded) == 1:  # a photo per page: take it at full resolution
                    pix = fitz.Pixmap(doc, embedded[0][0])
                    if pix.n - pix.alpha >= 4:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    images.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
                else:
                    pix = page.get_pixmap(dpi=200)
                    images.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
        return images
    return [open_image(path)]


def open_image(path: Path) -> Image.Image:
    if path.suffix.lower() in {".heic", ".heif"}:
        from pillow_heif import register_heif_opener

        register_heif_opener()
    return ImageOps.exif_transpose(Image.open(path)).convert("RGB")


def gutter(image: Image.Image) -> float:
    """Where the spine runs, as a fraction of the width: the calmest column band near the middle."""
    small = np.asarray(image.convert("L").resize((1000, max(1, round(1000 * image.height / image.width)))), dtype=np.float32)
    h = small.shape[0]
    energy = np.abs(np.diff(small[int(h * 0.1) : int(h * 0.9)], axis=1)).sum(axis=0)
    band = np.convolve(energy, np.ones(25), mode="same")
    lo, hi = 380, 620
    return (lo + int(np.argmin(band[lo:hi]))) / 1000


def split_pages(images: list[Image.Image]) -> list[tuple[Image.Image, str]]:
    """Two-page spreads (wider than tall) become two pages, each tagged with the side its spine is
    on ("right" for a left-hand page); single pages pass through with no spine side."""
    pages = []
    for image in images:
        if image.width / image.height > 1.05:
            cut = round(image.width * gutter(image))
            pages += [(image.crop((0, 0, cut, image.height)), "right"), (image.crop((cut, 0, image.width, image.height)), "left")]
        else:
            pages.append((image, ""))
    return pages


def trim_spine(image: Image.Image, spine: str, fraction: float) -> Image.Image:
    """Cut a sliver off the spine side: a strip of the facing page there can derail the reader."""
    cut = round(image.width * fraction)
    if spine == "left":
        return image.crop((cut, 0, image.width, image.height))
    if spine == "right":
        return image.crop((0, 0, image.width - cut, image.height))
    return image


def scaled(image: Image.Image, side: int) -> Image.Image:
    k = side / max(image.size)
    return image.resize((round(image.width * k), round(image.height * k)))


FOREIGN = re.compile(r"[　-鿿가-힯＀-￯]")


def failure(text: str) -> str:
    """Why a reading is unusable, or "" if it looks like a page of prose."""
    words = text.split()
    if len(text.strip()) < 200:
        return "almost no text"
    if re.search(r"\d{12,}", text):
        return "a run of digits"
    if len(words) >= 150 and len(set(words)) / len(words) < 0.25:
        return "the same words over and over"
    return ""


# ---------- OCR ----------
class Reader:
    """TeleOCR, loaded on first use and released after each scan so the GPU is free otherwise."""

    def __init__(self) -> None:
        self.model = self.processor = None

    def load(self) -> None:
        if self.model is not None:
            return
        import torch
        from transformers import AutoModel, AutoProcessor

        log("Loading TeleOCR ...")
        self.processor = AutoProcessor.from_pretrained(MODEL, trust_remote_code=True)
        self.model = AutoModel.from_pretrained(MODEL, trust_remote_code=True, dtype=torch.bfloat16).cuda().eval()

    def release(self) -> None:
        import torch

        self.model = self.processor = None
        torch.cuda.empty_cache()

    def read(self, image: Image.Image, spine: str = "") -> tuple[str, float, list[str], str]:
        """Text, mean token confidence (0-100), unsure words, and a note on any retry or failure.

        Vision-language readers occasionally lose their place and repeat a phrase or a digit until
        the token limit. Each attempt stops early when that starts; an unusable result is retried
        with a different crop or size, and if every attempt fails the page is left for the photo."""
        # Untrimmed first: trimming loses letters near the spine. Trims only follow a failed attempt.
        attempts = [(0, None), (0.03, None), (0.06, None), (0.02, 1600), (0.10, 1280)]
        reasons = []
        for i, (fraction, side) in enumerate(attempts):
            candidate = trim_spine(image, spine, fraction)
            if side:
                candidate = scaled(candidate, side)
            text, confidence, unsure = self.generate(candidate)
            problem = failure(text)
            if not problem:
                note = f"read on attempt {i + 1} after {'; '.join(reasons)}" if reasons else ""
                foreign = FOREIGN.findall(text)
                if foreign:
                    text = FOREIGN.sub("", text)
                    unsure = [FOREIGN.sub("", w) for w in unsure]
                    note = "; ".join(filter(None, [note, f"removed {len(foreign)} stray non-Latin character{'s' if len(foreign) > 1 else ''}"]))
                return text, confidence, unsure, note
            reasons.append(problem)
        return "", 0.0, [], f"could not be read ({'; '.join(reasons)}); read this page from the photo"

    def generate(self, image: Image.Image) -> tuple[str, float, list[str]]:
        import torch
        from transformers import StoppingCriteria, StoppingCriteriaList

        class Runaway(StoppingCriteria):
            """Stop once the newest tokens are one short pattern repeated eight times or more."""

            def __call__(self, input_ids, scores, **kwargs):
                ids = input_ids[0].tolist()
                for period in range(1, 41):
                    span = period * 8
                    if len(ids) >= span and ids[-span:] == ids[-period:] * 8:
                        return True
                return False

        self.load()
        messages = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}]
        chat = self.processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = self.processor(text=[chat], images=[image], return_tensors="pt").to(self.model.device)
        with torch.no_grad():
            out = self.model.generate(**inputs, max_new_tokens=3000, do_sample=False, output_scores=True, return_dict_in_generate=True, stopping_criteria=StoppingCriteriaList([Runaway()]))
        tokens = out.sequences[0][len(inputs.input_ids[0]) :]
        probs = [float(torch.softmax(score[0].float(), dim=-1)[tok]) for score, tok in zip(out.scores, tokens)]
        text = self.processor.batch_decode([tokens], skip_special_tokens=True)[0]
        pieces = [self.processor.tokenizer.decode([t], skip_special_tokens=True) for t in tokens]
        # Word-level uncertainty: a word is as sure as its least-sure token.
        unsure, word, low = [], "", 1.0
        for piece, p in zip(pieces, probs):
            for ch in piece:
                if ch.isspace():
                    if word.strip() and low < UNCERTAIN:
                        unsure.append(word.strip())
                    word, low = "", 1.0
                else:
                    word += ch
            low = min(low, p) if piece.strip() else low
        if word.strip() and low < UNCERTAIN:
            unsure.append(word.strip())
        confidence = 100 * math.exp(sum(math.log(max(p, 1e-6)) for p in probs) / max(1, len(probs)))
        return text, confidence, unsure


# ---------- text ----------
HEAD = re.compile(r"^\s*(\d{1,4})\s+\S|\S.*\s(\d{1,4})\s*$")


def running_head(lines: list[str]) -> tuple[int | None, int]:
    """The printed page number and how many leading lines form the running head."""
    for i, line in enumerate(lines[:3]):
        clean = re.sub(r"^\[(\d{1,4})\]", r"\1", re.sub(r"[#*_]", "", line).strip())
        if re.fullmatch(r"\d{1,4}", clean):
            return int(clean), i + 1
        m = HEAD.match(clean)
        if m and (clean.isupper() or re.search(r"CHAPTER|PART|[A-Z]{4,}", clean)):
            return int(m.group(1) or m.group(2)), i + 1
    return None, 0


def paragraphs(lines: list[str]) -> list[str]:
    out, current = [], ""
    for line in lines:
        line = re.sub(r"^#+\s*", "", line).replace("**", "").strip()
        if not line:
            if current:
                out.append(current)
            current = ""
            continue
        if re.match(r"^\[\d+\]", line) and current:
            out.append(current)
            current = line
            continue
        current = current[:-1] + line if current.endswith("-") and not current.endswith(" -") else (f"{current} {line}" if current else line)
    if current:
        out.append(current)
    # A model loop shows up as the same line many times: keep one.
    seen, kept = {}, []
    for p in out:
        seen[p] = seen.get(p, 0) + 1
        if seen[p] <= 1:
            kept.append(p)
    return kept


def number_pages(pages: list[dict]) -> None:
    """Make printed numbers consistent: consecutive pages count up by one, so the usual offset
    between position and printed number tells what a missing or misread number should be. A number
    is replaced only when no neighbour disagrees with that offset and at least one agrees (a skipped
    page stays visible)."""
    from collections import Counter

    offsets = Counter(p["printed"] - i for i, p in enumerate(pages) if p["printed"] is not None)
    if not offsets:
        return
    offset = offsets.most_common(1)[0][0]
    def agrees(j):  # True: neighbour fits the offset; None: no neighbour or no number to compare
        if j < 0 or j >= len(pages) or pages[j]["printed"] is None:
            return None
        return pages[j]["printed"] == j + offset

    for i, p in enumerate(pages):
        expected = i + offset
        sides = (agrees(i - 1), agrees(i + 1))
        if p["printed"] == expected or False in sides or True not in sides:
            continue
        if p["printed"] is None:
            p["flags"].append("page number not printed or not legible; inferred from its neighbours")
        else:
            p["flags"].append(f"page number read as {p['printed']}, set to {expected} from its neighbours")
        p["printed"] = expected
    for _ in range(len(pages)):  # numbers still missing where a neighbour was also missing
        for i, p in enumerate(pages):
            if p["printed"] is None and i and pages[i - 1]["printed"] is not None:
                p["printed"] = pages[i - 1]["printed"] + 1
                p["flags"].append("page number not printed or not legible; inferred from the page before")


def paragraph_flags(pages: list[dict]) -> None:
    """Judgment paragraph numbers count up; a step back or a big jump is worth a look."""
    prev = None
    for p in pages:
        for t in p["paragraphs"]:
            m = re.match(r"^\[(\d+)\]", t)
            if not m:
                continue
            n = int(m.group(1))
            if prev is not None and n != 1 and (n <= prev or n > prev + 40):
                p["flags"].append(f"paragraph [{n}] follows [{prev}]")
            prev = n


# ---------- matching ----------
READING = re.compile(r"([^\n•;]+?),\s*pp?\.\s*(\d+)\s*[–-]\s*(\d+)")


def assigned_readings(lectures: list[dict], courses: dict) -> list[dict]:
    out = []
    for lec in lectures:
        for m in READING.finditer(lec.get("notes", "")):
            out.append({"book": m.group(1).strip(" •-\t"), "first": int(m.group(2)), "last": int(m.group(3)), "lecture": lec, "course": courses.get(lec.get("courseId") or "", "")})
    return out


def match(first: int, last: int, filename: str, candidates: list[dict]) -> tuple[dict | None, str]:
    """The assigned reading this scan is, by page overlap plus words from the file name."""
    words = {w.lower() for w in re.findall(r"[A-Za-z]{4,}", filename)}
    scored = []
    for c in candidates:
        overlap = max(0, min(last, c["last"]) - max(first, c["first"]) + 1)
        if not overlap:
            continue
        cover = overlap / (c["last"] - c["first"] + 1)
        named = len(words & {w.lower() for w in re.findall(r"[A-Za-z]{4,}", c["book"] + " " + c["course"])})
        scored.append((named * 2 + cover, c))
    scored.sort(key=lambda x: -x[0])
    if not scored:
        return None, "no assigned reading covers these pages"
    if len(scored) > 1 and scored[0][0] - scored[1][0] < 0.5 and scored[0][1]["book"] != scored[1][1]["book"]:
        return None, "pages match more than one course's reading; add the course to the file name"
    return scored[0][1], ""


# ---------- worker ----------
class Worker:
    def __init__(self, key: str, base: str = WORKER) -> None:
        import requests

        self.http, self.key, self.base = requests.Session(), key, base

    def call(self, method: str, path: str, **kw):
        r = self.http.request(method, self.base + path, headers={"X-Widget-Key": self.key, **kw.pop("headers", {})}, timeout=120, **kw)
        body = r.json()
        if r.status_code >= 400 or body.get("error"):
            raise RuntimeError(f"{path}: {body.get('error')} {body.get('detail', '')}".strip())
        return body

    def lectures(self) -> tuple[list[dict], dict]:
        today = dt.date.today()
        body = self.call("GET", f"/notion/source-library/lectures?from={today - dt.timedelta(days=200)}&to={today + dt.timedelta(days=120)}")
        return body["lectures"], body.get("courses", {})

    def upload(self, image: Image.Image, name: str) -> str:
        buf = io.BytesIO()
        image.convert("RGB").resize((1000, round(1000 * image.height / image.width))).save(buf, "JPEG", quality=72, optimize=True)
        return self.call("POST", f"/notion/source-library/upload?name={name}", data=buf.getvalue(), headers={"Content-Type": "image/jpeg"})["id"]

    def inbox(self) -> list[dict]:
        return self.call("GET", "/notion/source-library/inbox").get("items", [])

    def chunk(self, item_id: str, file: int, chunk: int) -> bytes:
        r = self.http.get(f"{self.base}/notion/source-library/inbox/chunk", params={"id": item_id, "file": file, "chunk": chunk}, headers={"X-Widget-Key": self.key}, timeout=300)
        r.raise_for_status()
        return r.content

    def status(self, item_id: str, status: str, note: str = "", reading: dict | None = None) -> None:
        body = {"status": status, "note": note, **({"readingId": reading["id"], "readingUrl": reading["url"]} if reading else {})}
        self.call("POST", f"/notion/source-library/inbox/status?id={item_id}", json=body)

    def heartbeat(self, reading: str = "") -> None:
        self.call("POST", "/notion/source-library/inbox/heartbeat", json={"version": VERSION, "reading": reading})

    def file(self, reading: dict, batch: int = 40) -> dict:
        """File in batches: the Worker's free plan allows 50 Notion calls per request, one per page."""
        pages = reading["pages"]
        printed = [p["printed"] for p in pages]
        result = self.call("POST", "/notion/source-library/reading", json={**reading, "pages": pages[:batch], "firstPage": min(printed), "lastPage": max(printed)})
        for start in range(batch, len(pages), batch):
            more = self.call("POST", "/notion/source-library/reading", json={**reading, "pages": pages[start : start + batch], "readingId": result["reading"]["id"]})
            result["pages"] += more["pages"]
        return result


# ---------- one scan ----------
def process(path: Path, reader: Reader, worker: Worker | None, dry_run: bool = False) -> dict:
    started = time.time()
    pages_img = split_pages(load_images(path))
    log(f"{path.name}: {len(pages_img)} pages")
    pages = []
    for i, (image, spine) in enumerate(pages_img):
        text, confidence, unsure, note = reader.read(image, spine)
        lines = text.splitlines()
        printed, head = running_head(lines)
        flags = [note] if note else []
        if unsure:
            flags.append(f"uncertain word{'s' if len(unsure) > 1 else ''}: {', '.join(unsure[:12])}")
        pages.append({"printed": printed, "confidence": round(confidence, 1), "status": "Machine-read", "flags": flags, "paragraphs": paragraphs(lines[head:]), "image": image})
        log(f"  page {i + 1}/{len(pages_img)}: p. {printed}, confidence {confidence:.0f}, {len(unsure)} uncertain words{'; ' + note if note else ''}")
    reader.release()
    number_pages(pages)
    paragraph_flags(pages)
    known = [p["printed"] for p in pages if p["printed"] is not None]
    if not known:
        raise RuntimeError("no printed page numbers found; is this a textbook scan?")
    first, last = min(known), max(known)
    lectures, courses = worker.lectures() if worker else ([], {})
    reading, problem = match(first, last, path.stem, assigned_readings(lectures, courses))
    book = reading["book"] if reading else (re.sub(r"[\s,]*pp?\.?\s*\d+.*$", "", path.stem).strip() or path.stem)
    in_range = lambda n: [c["lecture"]["id"] for c in assigned_readings(lectures, courses) if reading and c["book"] == reading["book"] and c["first"] <= n <= c["last"]]
    result = {
        "title": f"{book}, pp. {first}–{last}",
        "book": book,
        "courseId": reading["lecture"].get("courseId") if reading else None,
        "lectureIds": sorted({lid for n in range(first, last + 1) for lid in in_range(n)}),
        "captured": dt.date.today().isoformat(),
        "notes": (f"Matched to {reading['lecture']['title']} ({reading['book']}, pp. {reading['first']}–{reading['last']}). " if reading else f"Needs filing: {problem}. ")
        + f"Read by the scan station from {path.name}; mean OCR confidence {sum(p['confidence'] for p in pages) / len(pages):.0f}.",
        "pages": [],
    }
    for p in pages:
        entry = {k: v for k, v in p.items() if k != "image"}
        entry["lectureIds"] = in_range(p["printed"])
        if worker and not dry_run:
            entry["imageUploadId"] = worker.upload(p["image"], f"{re.sub(r'[^A-Za-z]+', '-', book.split(':')[0]).strip('-')}-p{p['printed']}.jpg")
        result["pages"].append(entry)
    if dry_run or not worker:
        out = path.with_suffix(".scan.json")
        out.write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
        log(f"Dry run: wrote {out.name} ({time.time() - started:.0f} s)")
        return {"dry_run": str(out), "problem": problem}
    filed = worker.file(result)
    log(f"Filed {result['title']} ({len(pages)} pages, {time.time() - started:.0f} s): {filed['reading']['url']}")
    return {**filed, "problem": problem}


# ---------- watching ----------
def stable(path: Path) -> bool:
    """A scan is ready once nothing in it has changed for 15 seconds (sync has finished)."""
    files = [path] if path.is_file() else list(path.iterdir())
    return bool(files) and all(time.time() - f.stat().st_mtime > 15 for f in files)


def free_name(folder: Path, name: str) -> Path:
    stem, suffix, n = Path(name).stem, Path(name).suffix, 1
    path = folder / name
    while path.exists():
        n += 1
        path = folder / f"{stem} ({n}){suffix}"
    return path


def collect(worker: Worker, watch: Path, uploads: dict) -> None:
    """Bring scans added in Command Centre into the watched folder. One file lands as itself;
    several (photos) land as a folder, which the station reads as one reading."""
    for item in worker.inbox():
        if item.get("status") != "queued" or item["id"] in uploads.values():
            continue
        files = item["files"]
        single = len(files) == 1
        target = free_name(watch, item["name"] + Path(files[0]["name"]).suffix.lower()) if single else free_name(watch, item["name"])
        part = target.with_name(target.name + ".part")
        if not single:
            part.mkdir()
        for i, f in enumerate(files):
            data = b"".join(worker.chunk(item["id"], i, c) for c in range(f["chunks"]))
            (part if single else part / f"{i + 1:03d}{Path(f['name']).suffix.lower()}").write_bytes(data)
        part.rename(target)
        uploads[str(target)] = item["id"]
        INBOX.write_text(json.dumps(uploads), encoding="utf-8")
        worker.status(item["id"], "reading", "Received by the scan station; reading it now.")
        log(f"Collected {target.name} from Command Centre")


def run(config: dict) -> None:
    watch = Path(config["watch"])
    filed, attention = watch / "Filed", watch / "Needs attention"
    for d in (watch, filed, attention):
        d.mkdir(parents=True, exist_ok=True)
    reader, worker = Reader(), Worker(config["key"], config.get("worker", WORKER))
    uploads = json.loads(INBOX.read_text(encoding="utf-8")) if INBOX.exists() else {}
    log(f"Watching {watch}")
    beat = 0.0
    while True:
        try:
            if time.time() - beat > 900:
                worker.heartbeat()
                beat = time.time()
            collect(worker, watch, uploads)
        except Exception as error:  # offline: the folder still works
            log(f"Command Centre inbox unavailable: {error}")
        for item in sorted(watch.iterdir()):
            if item in (filed, attention) or item.name.startswith(".") or item.suffix in (".json", ".part"):
                continue
            if not (item.is_dir() or item.suffix.lower() in IMAGE_TYPES | {".pdf"}) or not stable(item):
                continue
            upload = uploads.pop(str(item), None)
            try:
                if upload:
                    worker.heartbeat(item.stem)
                result = process(item, reader, worker)
                target = attention if result.get("problem") else filed
                if upload:
                    worker.status(upload, "attention" if result.get("problem") else "filed", result.get("problem") or f"Filed {len(result.get('pages', []))} pages.", result.get("reading"))
            except Exception as error:  # keep watching; leave a note beside the scan
                log(f"Could not file {item.name}: {error}\n{traceback.format_exc()}")
                reader.release()
                target = attention
                (attention / f"{item.stem} - what went wrong.txt").write_text(str(error), encoding="utf-8")
                if upload:
                    try:
                        worker.status(upload, "failed", str(error)[:500])
                    except Exception:
                        pass
            shutil.move(str(item), str(free_name(target, item.name)))
            INBOX.write_text(json.dumps(uploads), encoding="utf-8")
            if upload:
                beat = 0.0  # tell Command Centre the station is free again
        time.sleep(20)


def setup() -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    icloud = Path.home() / "iCloudDrive" / "Law School Library"
    default = icloud if icloud.parent.exists() else Path.home() / "Documents" / "Law School Library"
    watch = input(f"Folder to watch [{default}]: ").strip() or str(default)
    key = getpass.getpass("Widget key (the Command Centre access key; input is hidden): ").strip()
    Path(watch).mkdir(parents=True, exist_ok=True)
    CONFIG.write_text(json.dumps({"watch": watch, "key": key, "worker": WORKER}, indent=1), encoding="utf-8")
    try:
        lectures, _ = Worker(key).lectures()
        print(f"Connected: {len(lectures)} lectures with readings found.")
    except Exception as error:
        print(f"Saved, but the Worker check failed: {error}")
    print(f"Saved to {CONFIG}. Drop scans into {watch}.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("setup")
    sub.add_parser("run")
    p = sub.add_parser("process")
    p.add_argument("path", type=Path)
    p.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.cmd == "setup":
        return setup()
    config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    if args.cmd == "run":
        if not config:
            sys.exit("Run `scan_station.py setup` first.")
        return run(config)
    worker = Worker(config["key"], config.get("worker", WORKER)) if config.get("key") else None
    print(json.dumps(process(args.path, Reader(), worker, args.dry_run), indent=1))


if __name__ == "__main__":
    main()
