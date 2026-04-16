export function cleanJsonString(input: string): string {
  let s = input;
  s = s.replace(/^[\s\S]*?(?=\{)/m, "");
  s = s.replace(/\}[\s\S]*$/, "}");
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  s = s.replace(/,\s*([\]}])/g, "$1");
  s = s.replace(/[\x00-\x1f]/g, " ");
  return s;
}

export function tryParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

export function parseJsonResponse<T>(rawText: string): T | null {
  return (
    tryParse<T>(rawText) ||
    tryParse<T>(cleanJsonString(rawText)) ||
    (() => {
      const match = rawText.match(/\{[\s\S]*\}/);
      return match ? tryParse<T>(cleanJsonString(match[0])) : null;
    })()
  );
}
