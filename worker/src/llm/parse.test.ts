/**
 * Characterisation tests for parseLlmJson (the tolerant JSON contract used by
 * the tutor and grade routes). These pin CURRENT behaviour; change them only
 * intentionally. Added in Phase V4-ii (2026-08-18); expectations verified by
 * executing the real logic before pushing.
 */
import { describe, expect, it } from "vitest";
import { parseLlmJson } from "./parse";

describe("parseLlmJson", () => {
  it("parses a plain object", () => {
    expect(parseLlmJson('{"ok":true}')).toEqual({ ok: true });
  });

  it("parses a fenced ```json block", () => {
    expect(parseLlmJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
  });

  it("slices off trailing prose after the object", () => {
    expect(parseLlmJson('{"ok":true}\nLet me know if you need more.')).toEqual({ ok: true });
  });

  it("unwraps the object out of an array payload (brace slicing pins current behaviour)", () => {
    expect(parseLlmJson('json: [{"ok":true}]')).toEqual({ ok: true });
  });

  it("parses a brace-free array as an array", () => {
    expect(parseLlmJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("repairs unescaped inner quotes in string values", () => {
    expect(parseLlmJson('{"feedback":"She said "hi" back","ok":true}')).toEqual({
      feedback: 'She said "hi" back',
      ok: true
    });
  });

  it("throws a diagnostic error on non-JSON input", () => {
    expect(() => parseLlmJson("not json at all")).toThrow(/parseLlmJson failed:/);
  });

  it("throws a diagnostic error on empty input", () => {
    expect(() => parseLlmJson("")).toThrow(/parseLlmJson failed:/);
  });
});
