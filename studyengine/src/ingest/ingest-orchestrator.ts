import { parseQecBlocks } from './qec-parser';
import { parseNotionAiSummaries } from './summary-parser';
import type { IngestBatch, SummarySection } from './types';

type HarvestOptions = {
  originDocUrl?: string;
  lectureAttended: boolean;
  qecSubCards?: boolean;
  sectionsEnabled?: Partial<Record<SummarySection, boolean>>;
};

export function harvestFromNotionMarkdown(markdown: string, options: HarvestOptions): IngestBatch {
  const qec = parseQecBlocks(markdown, {
    originDocUrl: options.originDocUrl,
    lectureAttended: options.lectureAttended,
    subCardsPerEBranch: !!options.qecSubCards,
  });
  const summaries = parseNotionAiSummaries(markdown, {
    originDocUrl: options.originDocUrl,
    sectionsEnabled: options.sectionsEnabled || {},
  });

  const warnings = [...qec.warnings, ...summaries.warnings];
  const deduped = [] as IngestBatch['drafts'];
  const seen = new Set<string>();
  [...qec.drafts, ...summaries.drafts].forEach((draft) => {
    const key = `${draft.prompt}::${draft.source.type}`;
    if (seen.has(key)) {
      warnings.push({ severity: 'warn', message: `Duplicate draft skipped for prompt "${draft.prompt}" (${draft.source.type})` });
      return;
    }
    seen.add(key);
    deduped.push(draft);
  });

  return {
    drafts: deduped,
    warnings,
    summary: {
      qecCount: qec.summary.qecCount,
      summaryCount: summaries.summary.summaryCount,
      skipped: qec.summary.skipped + summaries.summary.skipped,
    },
  };
}
