export class TutorJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorJsonParseError";
  }
}

function stripKnownJsonPreamble(input: string): string {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```$/i, "").trim();
  cleaned = cleaned.replace(/^here is the json requested:\s*/i, "");
  cleaned = cleaned.replace(/^here is (?:the )?json:\s*/i, "");
  cleaned = cleaned.replace(/^json\s*:\s*/i, "");
  return cleaned.trim();
}

function extractBalancedJsonCandidate(input: string): string | null {
  let start = -1;
  let opening = "";
  let closing = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === "{" || ch === "[") {
      start = i;
      opening = ch;
      closing = ch === "{" ? "}" : "]";
      break;
    }
  }
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === opening) depth += 1;
    if (ch === closing) {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }
  return null;
}

function parseFirstJsonObject(input: string): unknown {
  const trimmed = stripKnownJsonPreamble(input);
  const balanced = extractBalancedJsonCandidate(trimmed);
  const candidate = balanced || trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)?.[1] || trimmed;
  if (!candidate) {
    throw new TutorJsonParseError("No JSON candidate found in model output");
  }

  try {
    return JSON.parse(candidate);
  } catch {
    const closingIndex = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (closingIndex > -1) {
      const trimmedTail = candidate.slice(0, closingIndex + 1);
      try {
        return JSON.parse(trimmedTail);
      } catch {
        // fall through to typed error below
      }
    }
    throw new TutorJsonParseError("Unable to parse JSON candidate from model output");
  }
}

export function extractJsonFromModelOutput(raw: string): unknown {
  return parseFirstJsonObject(raw.trim());
}
