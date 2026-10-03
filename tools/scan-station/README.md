# Scan station

Turns photographed textbook readings into the Notion Source Library, which the tutor uses to cite readings by page instead of answering from memory. It runs on the desktop (NVIDIA GPU) and needs no Claude involvement.

## Using it

1. Scan the reading with the iPhone scanner (Files › ⋯ › Scan Documents, or Notes) and save it to **iCloud Drive › Law School Library**, or drop photos or a PDF into that folder on the PC. A folder of photos counts as one reading.
2. Name it after the course or book, for example `Property pp. 144-188`. The name only needs to tell courses apart when two readings share page numbers.
3. Within a few minutes the reading appears in **Source Library: Readings**, with one row per printed page in **Source Library: Pages**, linked to the course and to every lecture that assigns those pages. The scan moves to `Law School Library/Filed`.

If it cannot file a scan (no lecture assigns those pages, or two courses match), the scan moves to `Law School Library/Needs attention` with a note saying why.

**Better photos, better text:** shoot one page at a time where you can, press the spine flat, and avoid glare. The reader handles curved pages well, but words that disappear into the spine cannot be recovered.

## What it does

For each scan: split two-page spreads at the spine; read each page with [TeleOCR](https://huggingface.co/StarDoc-AI/TeleOCR) (Apache 2.0, a 1.2B vision-language model built for photographed documents); take the printed page number from the running head and repair a misread one from its neighbours; join lines into paragraphs and drop repeated lines; and file through the Worker (`/notion/source-library/*`), which holds the Notion token.

**Guardrails.** Vision-language readers occasionally lose their place and repeat a phrase or a digit until they run out of tokens (seen on a perfectly clear page in testing, with 99% "confidence"). The station stops generation as soon as a short pattern repeats; rejects text that is mostly repetition, long digit runs or nearly empty; and retries with a sliver trimmed off the spine side (where a strip of the facing page can trigger a loop) or at a smaller size. If every attempt fails, the page is filed with no text and a note to read it from the photo, never with the junk. Stray non-Latin characters (a training artefact) are removed and noted.

Each page row says how sure the reader was. Words the model was unsure of (its least-likely token under 30%), inferred page numbers, and judgment paragraph numbers that step backwards are listed in a yellow "Check against the photo" note. Nothing is silently corrected. The photo of the page is folded under the text.

Why TeleOCR: in a bake-off on photographed Property pages against a hand-checked answer key, its character error rate was 0.0% on two curved pages and 6.9% on a badly curled one (the missing words curve into the spine), against 0.8–10.2% for Tesseract with dewarping and similar accuracy at 20 to 40 times the time for PaddleOCR-VL. It reads raw photos better than dewarped ones, so the station does not dewarp. It takes about 20 seconds a page and 3 GB of GPU memory, loaded only while a scan is being read.

## Install (once)

```powershell
powershell -ExecutionPolicy Bypass -File tools\scan-station\setup.ps1
```

It creates a Python environment in `%LOCALAPPDATA%\ScanStation`, installs PyTorch (CUDA) and Transformers 4.x, asks for the folder to watch and the widget key (stored in `%APPDATA%\ScanStation\config.json`, never in the repository), downloads the model, and adds a startup shortcut. The log is `%APPDATA%\ScanStation\scan-station.log`.

The Worker's Notion integration must be able to edit the two Source Library databases (they sit under HQ+; if the station reports a 404 from Notion, open each database › ⋯ › Connections and add the integration).

## Commands

```bash
python scan_station.py setup
python scan_station.py run
python scan_station.py process "Property pp. 144-188.pdf" --dry-run
python -m unittest test_scan_station.py
```

`--dry-run` writes the result beside the scan as `.scan.json` and files nothing.
