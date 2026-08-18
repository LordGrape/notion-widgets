/**
 * Worker service layer: prompt context blocks assembled from the request
 * (learner profile, exam context, course policy and scope).
 * Split verbatim from routes/tutor.ts in Phase V4 (2026-08-18).
 * Content unchanged.
 */
import type { TutorMode, TutorRequest } from "../../types";
import { daysUntilExam } from "../../utils/helpers";

export function formatLearnerProfileBlock(learner: Record<string, unknown> | undefined, itemRef: TutorRequest["item"]): string {
  if (!learner || typeof learner !== "object") return "";
  const cs = (learner.courseStats as Record<string, unknown> | undefined) || {};
  const card = (learner.cardHistory as Record<string, unknown> | undefined) || {};
  const strong = Array.isArray(learner.strongTopics) ? learner.strongTopics : [];
  const weak = Array.isArray(learner.weakTopics) ? learner.weakTopics : [];
  const mems = Array.isArray(learner.relevantMemories) ? learner.relevantMemories : [];
  const cal = learner.calibrationAccuracy;
  const streak = learner.overallStreak != null ? learner.overallStreak : 0;
  const cardLine = card.isNew
    ? "First time"
    : `${card.reps ?? 0} reviews, ${card.lapses ?? 0} lapses, stability ${Math.round(Number(card.stability) || 0)} days`;
  const lines = [
    "\n\n---\n\nLEARNER PROFILE (BACKGROUND CONTEXT FROM PRIOR SESSIONS — these are AI-observed patterns, NOT things the student said in this conversation. Never attribute these as direct quotes or statements by the student. Do not say 'you mentioned' or 'you said' — say 'I've noticed' or 'from prior sessions' instead):\n",
    `- Course: ${itemRef.course || ""} (${Number(cs.totalCards) || 0} cards, ${Number(cs.reviewedCards) || 0} reviewed)`,
    `- Strong topics: ${strong.length ? strong.join(", ") : "None identified yet"}`,
    `- Weak topics: ${weak.length ? weak.join(", ") : "None identified yet"}`,
    `- This card: ${cardLine}`,
    `- Calibration accuracy: ${cal != null && !Number.isNaN(Number(cal)) ? `${Math.round(Number(cal) * 100)}%` : "Not enough data"}`,
    `- Study streak: ${String(streak)} days`
  ];

  const nudgeTopics = learner.calibrationNudgeTopics;
  if (Array.isArray(nudgeTopics) && nudgeTopics.length > 0) {
    lines.push(
      `- ⚠ Overconfident topics (low retention despite reviews): ${nudgeTopics.join(", ")}`,
      "- When reviewing cards from these topics, gently challenge the student's confidence: \"Your self-ratings on this topic have been optimistic — let's verify what you actually remember.\""
    );
  }

  if (learner.primaryErrorPattern) {
    const patternLabels: Record<string, string> = {
      factual_miss: "factual recall gaps",
      reasoning_gap: "incomplete reasoning chains",
      under_elaboration: "naming concepts without explaining them",
      misconception: "actively wrong mental models",
      prerequisite_gap: "missing foundational concepts",
      framework_mismatch: "using different analytical frameworks than expected"
    };
    const key = String(learner.primaryErrorPattern);
    const label = patternLabels[key] || key;
    lines.push(
      `- ⚠ Primary error pattern: ${label} (${String(learner.primaryErrorPct || "?")}% of recent errors)`,
      `- When this student makes an error, it is most likely ${label}. Tailor your diagnostic questions accordingly.`
    );
  }

  if (mems.length > 0) {
    lines.push("- AI-observed patterns from prior sessions (do NOT present these as things the student said):");
    for (const mline of mems) lines.push(`  * ${String(mline)}`);
  }

  lines.push(
    "",
    "Use this profile to personalise your tutoring:",
    "- Reference their known strengths to build bridges to weak areas",
    "- If their error matches a known pattern, address the pattern directly",
    "- If calibration is low (below 70%), gently challenge their self-assessment",
    "- If this card has high lapses, acknowledge the difficulty and try a different angle than previous attempts"
  );

  return lines.join("\n");
}

export function formatExamContextBlock(cc: NonNullable<TutorRequest["context"]>["courseContext"]): string {
  if (!cc || typeof cc !== "object") return "";
  const fmt = cc.examType || "Unknown";
  const fmtExtra = cc.examFormat ? ` — ${cc.examFormat}` : "";
  const days = cc.examDate ? daysUntilExam(cc.examDate) : null;
  const dateLine = cc.examDate && days != null ? `${cc.examDate} (${days} days away)` : cc.examDate ? String(cc.examDate) : "Not set";
  const weightLine =
    cc.examWeight != null && !Number.isNaN(Number(cc.examWeight)) ? `${cc.examWeight}% of final grade` : "Unknown";
  const mats = cc.allowedMaterials || "Unknown";
  const lines = [
    "\n\n---\n\nEXAM CONTEXT:\n",
    `- Format: ${fmt}${fmtExtra}`,
    `- Date: ${dateLine}`,
    `- Weight: ${weightLine}`,
    `- Allowed materials: ${mats}`
  ];
  if (cc.professorValues) lines.push(`- Professor values: ${cc.professorValues}`);
  if (cc.syllabusContext) lines.push(`- Course scope: ${cc.syllabusContext}`);
  lines.push(
    "",
    "Tailor your feedback to this exam context:",
    "- If the professor values specific things (case citations, counter-arguments, etc.), check for them",
    "- If the exam is essay format, evaluate argument structure; if MC, focus on precision of key distinctions",
    "- As the exam date approaches, increase urgency and focus on high-yield review"
  );
  return lines.join("\n");
}

export function buildTutorContextBlock(ctx: TutorRequest["courseContext"] | undefined, mode: TutorMode): string {
  if (!ctx || mode === "acknowledge") return "";

  const blocks: string[] = [];
  const stance = ctx.aiPolicy && typeof ctx.aiPolicy === "object" ? ctx.aiPolicy.stance : undefined;
  if (stance === "banned") {
    blocks.push(
      "CRITICAL: The student's professor has banned AI use on graded work. Your role is strictly practice and understanding. NEVER produce text that could be submitted as the student's work. If asked to write an essay, outline, or answer for submission, refuse and redirect to practice questions."
    );
  } else if (stance === "restricted") {
    blocks.push(
      "Note: The student's professor restricts AI use. Stay focused on explaining concepts and probing understanding. Do not produce polished submittable prose."
    );
  }

  const academicIntegrityHints = Array.isArray(ctx.academicIntegrityHints) ? ctx.academicIntegrityHints : [];
  if (academicIntegrityHints.length > 0) {
    const hints = academicIntegrityHints
      .map((hint) => String(hint || "").trim())
      .filter(Boolean)
      .map((hint) => `- ${hint}`);
    if (hints.length > 0) {
      blocks.push(`Course integrity notes:\n${hints.join("\n")}`);
    }
  }

  const allowedMode = ctx.allowedMaterials && typeof ctx.allowedMaterials === "object"
    ? ctx.allowedMaterials.mode
    : undefined;
  if ((mode === "quick" || mode === "insight") && allowedMode === "closed_book") {
    blocks.push("The student is studying for closed-book conditions. Keep scaffolds terse — framework names, not full explanations.");
  } else if ((mode === "quick" || mode === "insight") && allowedMode === "open_book") {
    blocks.push("Open-book assessment. Referencing textbooks or specific chapter concepts is acceptable.");
  }

  const contextSections: string[] = [];
  const professorValueHints = Array.isArray(ctx.professorValueHints) ? ctx.professorValueHints : [];
  if (professorValueHints.length > 0) {
    const lines = professorValueHints
      .map((hint) => {
        const value = String((hint as { value?: string }).value || "").trim();
        const evidence = String((hint as { evidence?: string }).evidence || "").trim();
        if (!value) return "";
        return evidence ? `- ${value} (evidence: "${evidence}")` : `- ${value}`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      contextSections.push(`Professor's stated values for this course:\n${lines.join("\n")}`);
    }
  }

  const scopeTerms = Array.isArray(ctx.scopeTerms)
    ? ctx.scopeTerms.map((term) => String(term || "").trim()).filter(Boolean)
    : [];
  if (scopeTerms.length > 0) {
    contextSections.push(
      "Course scope (student answers should engage these terms/concepts):\n" +
      `${scopeTerms.join(", ")}`
    );
  }

  if (contextSections.length > 0) {
    blocks.push(`COURSE CONTEXT:\n\n${contextSections.join("\n\n")}`);
  }

  if (blocks.length === 0) return "";
  return blocks.join("\n\n");
}
