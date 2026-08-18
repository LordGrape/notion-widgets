/**
 * Characterisation tests for extractJsonFromModelOutput (json-extract.ts),
 * the balanced-brace tolerant extractor. These pin CURRENT behaviour.
 * Added in Phase V4-ii (2026-08-18); expectations verified by executing the
 * real logic before pushing.
 */
import { describe, expect, it } from "vitest";
import { TutorJsonParseError, extractJsonFromModelOutput } from "./json-extract";

describe("extractJsonFromModelOutput", () => {
  it("parses a plain object", () => {
    expect(extractJsonFromModelOutput('{"ok":true}')).toEqual({ ok: true });
  });

  it("parses a fenced block with a json tag", () => {
    expect(extractJsonFromModelOutput('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("parses a fenced block without a tag", () => {
    expect(extractJsonFromModelOutput('```\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("strips the 'Here is the JSON requested:' preamble", () => {
    expect(extractJsonFromModelOutput('Here is the JSON requested: {"ok":true}')).toEqual({ ok: true });
  });

  it("strips the 'Here is the JSON:' preamble", () => {
    expect(extractJsonFromModelOutput('Here is the JSON: {"ok":true}')).toEqual({ ok: true });
  });

  it("strips the 'json:' preamble", () => {
    expect(extractJsonFromModelOutput('json: {"ok":true}')).toEqual({ ok: true });
  });

  it("extracts the balanced object ahead of trailing prose", () => {
    expect(extractJsonFromModelOutput('{"ok":true} Let me know if you need more.')).toEqual({ ok: true });
  });

  it("does not let braces inside strings break balancing", () => {
    expect(extractJsonFromModelOutput('{"a":"}{"} trailing text')).toEqual({ a: "}{" });
  });

  it("throws TutorJsonParseError on unparseable non-empty input", () => {
    expect(() => extractJsonFromModelOutput("no json here")).toThrow(TutorJsonParseError);
    expect(() => extractJsonFromModelOutput("no json here")).toThrow(/Unable to parse JSON candidate/);
  });

  it("throws the no-candidate variant on empty input", () => {
    expect(() => extractJsonFromModelOutput("")).toThrow(/No JSON candidate found/);
  });
});
