/**
 * Tests for worker utils/helpers.ts: exam countdown math, stable hashing,
 * and the deterministic fallback learn plan. Added in Phase V4-ii
 * (2026-08-18). Fixtures are synthetic and public-domain per the fixture rule.
 */
import { describe, expect, it } from "vitest";
import { buildFallbackLearnPlan, daysUntilExam, hashString } from "./helpers";

const SYNTHETIC_CARDS = [
  { id: "c1", prompt: "What gas do plants release during photosynthesis?", modelAnswer: "Oxygen." },
  { id: "c2", prompt: "When did Apollo 11 land on the Moon?", modelAnswer: "July 20, 1969." },
  { id: "c3", prompt: "What is the Pythagorean theorem?", modelAnswer: "a squared plus b squared equals c squared." },
  { id: "c4", prompt: "When was the United Nations founded?", modelAnswer: "1945." },
  { id: "c5", prompt: "What colour does litmus paper turn in acid?", modelAnswer: "Red." },
  { id: "c6", prompt: "What is the capital of France?", modelAnswer: "Paris." },
  { id: "c7", prompt: "Who wrote Romeo and Juliet?", modelAnswer: "William Shakespeare." }
];

describe("daysUntilExam", () => {
  it("returns null for missing or invalid input", () => {
    expect(daysUntilExam(null)).toBeNull();
    expect(daysUntilExam(undefined)).toBeNull();
    expect(daysUntilExam("")).toBeNull();
    expect(daysUntilExam("not-a-date")).toBeNull();
  });

  it("clamps past dates to zero", () => {
    expect(daysUntilExam("2001-07-20")).toBe(0);
  });

  it("returns a positive whole-day count for a far-future date", () => {
    const days = daysUntilExam("2099-01-15");
    expect(typeof days === "number" && days > 0 && Number.isInteger(days)).toBe(true);
  });
});

describe("hashString", () => {
  it("is deterministic and base36-encoded", () => {
    const a = hashString("photosynthesis");
    expect(a).toBe(hashString("photosynthesis"));
    expect(a).toMatch(/^[0-9a-z]+$/);
  });

  it("differs for different inputs", () => {
    expect(hashString("Apollo 11")).not.toBe(hashString("Apollo 13"));
  });
});

describe("buildFallbackLearnPlan", () => {
  it("caps the plan at six segments and links card ids", () => {
    const plan = buildFallbackLearnPlan({ cards: SYNTHETIC_CARDS, topics: ["Biology"] });
    expect(plan.segments).toHaveLength(6);
    expect(plan.segments[0].id).toBe("seg-fallback-1");
    expect(plan.segments[0].linkedCardIds).toEqual(["c1"]);
  });

  it("derives the concept from the prompt's question stem", () => {
    const plan = buildFallbackLearnPlan({ cards: SYNTHETIC_CARDS });
    expect(plan.segments[0].concept).toBe("What gas do plants release during photosynthesis");
    expect(plan.segments[0].checkQuestion).toBe("What gas do plants release during photosynthesis?");
    expect(plan.segments[0].explanation).toBe("Oxygen.");
  });

  it("alternates check types between elaborative and predict", () => {
    const plan = buildFallbackLearnPlan({ cards: SYNTHETIC_CARDS });
    expect(plan.segments.map((s) => s.checkType)).toEqual(["elaborative", "predict", "elaborative", "predict", "elaborative", "predict"]);
  });

  it("uses the first topic in the elaboration scaffold when provided", () => {
    const withTopic = buildFallbackLearnPlan({ cards: SYNTHETIC_CARDS, topics: ["Biology"] });
    expect(withTopic.segments[0].elaboration).toContain("Biology");
    const withoutTopic = buildFallbackLearnPlan({ cards: SYNTHETIC_CARDS });
    expect(withoutTopic.segments[0].elaboration).toContain("the current topic");
  });

  it("falls back cleanly for a card with no prompt and a numeric id", () => {
    const plan = buildFallbackLearnPlan({ cards: [{ id: 42, modelAnswer: "Oxygen." }] });
    expect(plan.segments[0].concept).toBe("Concept 1");
    expect(plan.segments[0].checkQuestion).toBe("Explain Concept 1 in your own words.");
    expect(plan.segments[0].linkedCardIds).toEqual(["42"]);
  });

  it("collects at most five linked card ids in the consolidation question", () => {
    const plan = buildFallbackLearnPlan({ cards: SYNTHETIC_CARDS });
    expect(plan.consolidationQuestions).toHaveLength(1);
    expect(plan.consolidationQuestions[0].linkedCardIds).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("returns an empty segment list and a bare consolidation question for an empty body", () => {
    const plan = buildFallbackLearnPlan({});
    expect(plan.segments).toEqual([]);
    expect(plan.consolidationQuestions).toHaveLength(1);
    expect(plan.consolidationQuestions[0].linkedCardIds).toEqual([]);
  });
});
