// B1: tolerant LLM JSON parsing for studyengine routes.
export function parseLlmJson(rawText: string): unknown {
  const originalRaw = String(rawText ?? "");
  let text = originalRaw.trim();

  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) {
    text = fenced[1].trim();
  }

  const firstObject = text.indexOf("{");
  const lastObject = text.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    text = text.slice(firstObject, lastObject + 1);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    const repaired = maybeRepairInnerQuotes(text, err);
    if (repaired != null) {
      try {
        return JSON.parse(repaired);
      } catch {
        // fall through to diagnostic throw below
      }
    }
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`parseLlmJson failed: ${reason}; raw=${originalRaw}`);
  }
}

function maybeRepairInnerQuotes(input: string, err: unknown): string | null {
  const message = err instanceof Error ? err.message : "";
  if (!/position\s+\d+/i.test(message)) return null;

  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (!inString) {
      if (ch === "\"") inString = true;
      out += ch;
      escaped = false;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === "\"") {
      const prevNonWs = findPrevNonWhitespace(out);
      const nextNonWs = findNextNonWhitespace(input, i + 1);
      const looksLikeTerminator = nextNonWs === "," || nextNonWs === "}" || nextNonWs === "]";
      const looksLikeKeyOpen = nextNonWs === ":";
      const afterColon = prevNonWs === ":";
      if (looksLikeTerminator || looksLikeKeyOpen || afterColon) {
        inString = false;
        out += ch;
      } else {
        out += "\\\"";
      }
      continue;
    }

    out += ch;
  }

  return out;
}

function findPrevNonWhitespace(input: string): string {
  for (let i = input.length - 1; i >= 0; i -= 1) {
    const ch = input[i];
    if (!/\s/.test(ch)) return ch;
  }
  return "";
}

function findNextNonWhitespace(input: string, start: number): string {
  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (!/\s/.test(ch)) return ch;
  }
  return "";
}
