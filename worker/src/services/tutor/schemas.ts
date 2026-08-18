/**
 * Worker service layer: tutor response-shape exemplars (prompt-facing text)
 * and Gemini responseSchema objects (the structured-output contract).
 * Split verbatim from routes/tutor.ts in Phase V4 (2026-08-18).
 * Content unchanged; both blocks were previously per-request constants
 * inside handleTutor and are now module constants.
 */
import type { GeminiJsonValue } from "../../gemini";
import type { TutorMode } from "../../types";

export const responseSchemas: Record<TutorMode, string> = {
  socratic: `{
  "tutorMessage": "3-5 sentences. Acknowledge what's right, identify the gap.",
  "followUpQuestion": "One targeted question. Null if isComplete.",
  "isComplete": false,
  "suggestedRating": null,
  "annotations": [{ "text": "exact phrase from student", "tag": "accurate|partial|inaccurate|missing|insight", "note": "brief explanation" }],
  "reconstructionPrompt": null
}`,
  quick: `{
  "correct": "One sentence citing student's words.",
  "missing": "One sentence — the key gap.",
  "bridge": "One sentence connecting known to unknown.",
  "quickCheck": { "question": "...", "answer": "..." },
  "suggestedRating": 3,
  "annotations": [{ "text": "...", "tag": "...", "note": "..." }]
}`,
  teach: `{
  "tutorMessage": "3-5 sentences. Acknowledge what's right, identify the gap.",
  "followUpQuestion": "One targeted question. Null if isComplete.",
  "isComplete": false,
  "suggestedRating": null,
  "annotations": [{ "text": "exact phrase from student", "tag": "accurate|partial|inaccurate|missing|insight", "note": "brief explanation" }],
  "reconstructionPrompt": null
}`,
  insight: `{
  "insight": "One or two sentences — the key anchor for this fact.",
  "followUpQuestion": "A self-test question scaled to the student's rating level. Simple recall for struggling students, analytical for strong ones. Null only if trivial.",
  "followUpAnswer": "The answer to the follow-up question. Keep it concise. Null if no question."
}`,
  acknowledge: `{
  "acknowledgment": "2-3 sentences citing specific strengths.",
  "extensionQuestion": "One question pushing beyond the model answer.",
  "isComplete": false,
  "suggestedRating": null
}`,
  freeform: `{
  "tutorMessage": "2-5 sentences answering the question + one extension.",
  "followUpQuestion": "Optional short follow-up to deepen thinking. Null if isComplete.",
  "isComplete": false,
  "suggestedRating": null,
  "annotations": []
}`
};

export const responseSchemaObjects: Record<TutorMode, GeminiJsonValue> = {
  socratic: {
    type: "object",
    properties: {
      tutorMessage: { type: "string" },
      followUpQuestion: { type: "string", nullable: true },
      isComplete: { type: "boolean" },
      suggestedRating: { type: "integer", nullable: true },
      diagnosisType: {
        type: "string",
        enum: ["factual_miss", "reasoning_gap", "under_elaboration", "misconception", "prerequisite_gap", "framework_mismatch"],
        nullable: true
      },
      annotations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            tag: { type: "string" },
            note: { type: "string" }
          }
        }
      },
      reconstructionPrompt: { type: "string", nullable: true }
    },
    required: ["tutorMessage", "isComplete"]
  },
  quick: {
    type: "object",
    properties: {
      correct: { type: "string" },
      missing: { type: "string" },
      bridge: { type: "string" },
      quickCheck: {
        type: "object",
        nullable: true,
        properties: {
          question: { type: "string" },
          answer: { type: "string" }
        }
      },
      tutorMessage: { type: "string", nullable: true },
      suggestedRating: { type: "integer", nullable: true },
      diagnosisType: {
        type: "string",
        enum: ["factual_miss", "reasoning_gap", "under_elaboration", "misconception", "prerequisite_gap", "framework_mismatch"],
        nullable: true
      },
      annotations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            tag: { type: "string" },
            note: { type: "string" }
          }
        }
      }
    },
    required: ["correct", "missing", "bridge"]
  },
  teach: {
    type: "object",
    properties: {
      tutorMessage: { type: "string" },
      followUpQuestion: { type: "string", nullable: true },
      isComplete: { type: "boolean" },
      suggestedRating: { type: "integer", nullable: true },
      diagnosisType: {
        type: "string",
        enum: ["factual_miss", "reasoning_gap", "under_elaboration", "misconception", "prerequisite_gap", "framework_mismatch"],
        nullable: true
      },
      annotations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            tag: { type: "string" },
            note: { type: "string" }
          }
        }
      },
      reconstructionPrompt: { type: "string", nullable: true }
    },
    required: ["tutorMessage", "isComplete"]
  },
  insight: {
    type: "object",
    properties: {
      insight: { type: "string" },
      followUpQuestion: { type: "string", nullable: true },
      followUpAnswer: { type: "string", nullable: true }
    },
    required: ["insight"]
  },
  acknowledge: {
    type: "object",
    properties: {
      acknowledgment: { type: "string" },
      extensionQuestion: { type: "string", nullable: true },
      isComplete: { type: "boolean" },
      suggestedRating: { type: "integer", nullable: true }
    },
    required: ["acknowledgment", "isComplete"]
  },
  freeform: {
    type: "object",
    properties: {
      tutorMessage: { type: "string" },
      followUpQuestion: { type: "string" },
      isComplete: { type: "boolean" },
      suggestedRating: { type: "integer", nullable: true },
      annotations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            text: { type: "string" },
            tag: { type: "string" },
            note: { type: "string" }
          }
        }
      }
    },
    required: ["tutorMessage", "isComplete"]
  }
};
