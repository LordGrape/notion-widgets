export interface LearnPlanCardLike {
  id?: string | number;
  prompt?: string;
  modelAnswer?: string;
}

export interface LearnPlanFallbackBody {
  cards?: LearnPlanCardLike[];
  topics?: string[];
}

export interface LearnPlanSegment {
  id: string;
  concept: string;
  explanation: string;
  elaboration: string;
  checkType: "elaborative" | "predict";
  checkQuestion: string;
  checkAnswer: string;
  linkedCardIds: string[];
}

export interface LearnPlanFallback {
  segments: LearnPlanSegment[];
  consolidationQuestions: Array<{
    question: string;
    answer: string;
    linkedCardIds: string[];
  }>;
}

export function daysUntilExam(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const d = new Date(s.length <= 10 ? `${s}T12:00:00` : s);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function buildFallbackLearnPlan(body: LearnPlanFallbackBody): LearnPlanFallback {
  const cards = Array.isArray(body?.cards) ? body.cards.slice(0, 6) : [];
  const topics = Array.isArray(body?.topics) ? body.topics : [];

  const segments: LearnPlanSegment[] = cards.map((card, idx) => {
    const prompt = String(card?.prompt || "").trim();
    const answer = String(card?.modelAnswer || "").trim();
    const concept = prompt.split("?")[0].trim() || `Concept ${idx + 1}`;

    return {
      id: `seg-fallback-${idx + 1}`,
      concept: concept.slice(0, 100),
      explanation: answer || "Use your course materials to define this concept clearly.",
      elaboration: `Connect this idea to ${topics[0] || "the current topic"} and explain why it matters.`,
      checkType: idx % 2 === 0 ? "elaborative" : "predict",
      checkQuestion: prompt || `Explain ${concept} in your own words.`,
      checkAnswer: answer || "A clear, accurate explanation that uses key terms from your class.",
      linkedCardIds: card?.id ? [String(card.id)] : []
    };
  });

  const consolidationQuestions = [
    {
      question: "What are the most important connections across the concepts you just studied?",
      answer: "A good answer names each concept and explains how they build on each other.",
      linkedCardIds: segments.flatMap((segment) => segment.linkedCardIds).slice(0, 5)
    }
  ];

  return { segments, consolidationQuestions };
}
