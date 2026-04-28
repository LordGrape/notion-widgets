import type { StudyItem } from '../types';

export function shouldAutoGenerateVisual(item: StudyItem): boolean {
  if (!item || typeof item !== 'object') return false;
  const visualHint = ((item as unknown as { visualHint?: string }).visualHint || '').trim();

  // Always generate when card explicitly requests a visual.
  if (visualHint.length > 0) return true;

  // Worked Example and Mock Exam tiers benefit from diagrams structurally.
  if (item.tier === 'worked' || item.tier === 'mock') return true;

  // Skip when prompt is a single token.
  const prompt = (item.prompt || '').trim();
  if (prompt.length === 0) return false;
  const tokenCount = prompt.split(/\s+/).filter(Boolean).length;
  if (tokenCount <= 1) return false;

  // Skip when modelAnswer lacks structural complexity Mermaid can represent.
  const ans = (item.modelAnswer || '').trim();
  if (ans.length < 120) return false;

  return (
    /^#{1,3} /m.test(ans) ||
    /^\s*[-*] .+\n\s+[-*] /m.test(ans) ||
    /→|->|\u2192/.test(ans) ||
    /\b(versus|vs\.?|compared to|contrast)\b/i.test(ans)
  );
}
