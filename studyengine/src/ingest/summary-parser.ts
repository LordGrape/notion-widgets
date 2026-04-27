import { createDraftId, type DraftCard, type IngestBatch, type SummarySection } from './types';

type SummaryOptions = {
  originDocUrl?: string;
  sectionsEnabled: Partial<Record<SummarySection, boolean>>;
};

const DEFAULT_SECTIONS: Record<SummarySection, boolean> = {
  'key-concepts': true,
  'important-arguments': false,
  'exam-ready-facts': true,
  'essay-hooks': false,
  'key-quotes': false,
  'memory-anchor': true,
};

function emptyBatch(): IngestBatch {
  return { drafts: [], warnings: [], summary: { qecCount: 0, summaryCount: 0, skipped: 0 } };
}

function cleanText(value: string): string {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function isEnabled(section: SummarySection, sectionsEnabled: Partial<Record<SummarySection, boolean>>): boolean {
  if (typeof sectionsEnabled[section] === 'boolean') return !!sectionsEnabled[section];
  return DEFAULT_SECTIONS[section];
}

function toDraft(prompt: string, modelAnswer: string, section: SummarySection, options: SummaryOptions, detailsAnchor: string): DraftCard {
  return {
    id: createDraftId(),
    prompt: cleanText(prompt),
    modelAnswer: cleanText(modelAnswer),
    source: {
      type: 'notion-ai-summary',
      originDocUrl: options.originDocUrl,
      summaryBlockId: detailsAnchor,
      sourceSection: section,
      lectureAttended: false,
    },
  };
}

function extractDetailsBlocks(markdown: string): Array<{ body: string; line: number; id: string }> {
  const blocks: Array<{ body: string; line: number; id: string }> = [];
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    if (!/<details>/i.test(lines[i])) continue;
    const start = i;
    const collected: string[] = [];
    i += 1;
    while (i < lines.length && !/<\/details>/i.test(lines[i])) {
      collected.push(lines[i]);
      i += 1;
    }
    blocks.push({ body: collected.join('\n'), line: start + 1, id: `details-${start + 1}` });
  }
  return blocks;
}

function headingMatch(input: string, label: string): boolean {
  const norm = input.toLowerCase().replace(/[.:]/g, '').replace(/\band\b/g, '&').replace(/\s+/g, ' ').trim();
  const target = label.toLowerCase().replace(/[.:]/g, '').replace(/\band\b/g, '&').replace(/\s+/g, ' ').trim();
  return norm.includes(target);
}

function splitSections(body: string): Array<{ heading: string; content: string }> {
  const lines = body.split('\n');
  const sections: Array<{ heading: string; content: string }> = [];
  let currentHeading = '';
  let currentContent: string[] = [];

  const flush = () => {
    if (!currentHeading) return;
    sections.push({ heading: currentHeading, content: currentContent.join('\n') });
  };

  for (const line of lines) {
    const hm = line.match(/^###\s+(.+)$/);
    if (hm) {
      flush();
      currentHeading = hm[1];
      currentContent = [];
      continue;
    }
    if (currentHeading) currentContent.push(line);
  }
  flush();
  return sections;
}

function firstClause(text: string): string {
  const trimmed = cleanText(text).replace(/^-\s*/, '');
  const idx = trimmed.search(/[;,.]/);
  return idx > 0 ? trimmed.slice(0, idx) : trimmed;
}

export function parseNotionAiSummaries(markdown: string, options: SummaryOptions): IngestBatch {
  const batch = emptyBatch();
  const detailsBlocks = extractDetailsBlocks(markdown);

  detailsBlocks.forEach((block) => {
    const sections = splitSections(block.body);
    sections.forEach((section) => {
      const heading = section.heading;
      const content = section.content;

      if (headingMatch(heading, 'Key Concepts & Definitions') && isEnabled('key-concepts', options.sectionsEnabled)) {
        const rowRegex = /\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|/g;
        let m: RegExpExecArray | null;
        while ((m = rowRegex.exec(content))) {
          const term = cleanText(m[1]);
          const def = cleanText(m[2]);
          if (!term || !def || /^[-:]+$/.test(term) || (term.toLowerCase() === 'term' && def.toLowerCase() === 'definition')) continue;
          batch.drafts.push(toDraft(term, def, 'key-concepts', options, block.id));
          batch.summary.summaryCount += 1;
        }
      }

      if (headingMatch(heading, 'Important Arguments') && isEnabled('important-arguments', options.sectionsEnabled)) {
        const bullets = content.match(/^\s*[-*]\s+.+$/gm) || [];
        bullets.filter((line) => !/^\s{2,}/.test(line)).forEach((bullet) => {
          const full = cleanText(bullet.replace(/^\s*[-*]\s+/, ''));
          if (!full) return;
          batch.drafts.push(
            toDraft(`What is the argument that ${firstClause(full)}?`, full, 'important-arguments', options, block.id)
          );
          batch.summary.summaryCount += 1;
        });
      }

      if (headingMatch(heading, 'Exam-Ready Facts') && isEnabled('exam-ready-facts', options.sectionsEnabled)) {
        const bullets = content.match(/^\s*[-*]\s+.+$/gm) || [];
        bullets.forEach((bullet) => {
          const fact = cleanText(bullet.replace(/^\s*[-*]\s+/, ''));
          if (!fact) return;
          batch.drafts.push(toDraft(`What exam-ready fact states: ${firstClause(fact)}?`, fact, 'exam-ready-facts', options, block.id));
          batch.summary.summaryCount += 1;
        });
      }

      if ((headingMatch(heading, 'Essay Hooks') || headingMatch(heading, 'Essay Hooks & Integration')) && isEnabled('essay-hooks', options.sectionsEnabled)) {
        const bullets = content.match(/^\s*[-*]\s+.+$/gm) || [];
        bullets.forEach((bullet) => {
          const hook = cleanText(bullet.replace(/^\s*[-*]\s+/, ''));
          if (!hook) return;
          batch.drafts.push(toDraft(`How would you integrate ${firstClause(hook)}?`, hook, 'essay-hooks', options, block.id));
          batch.summary.summaryCount += 1;
        });
      }

      if (headingMatch(heading, 'Key Quotes') && isEnabled('key-quotes', options.sectionsEnabled)) {
        const bullets = content.match(/^\s*[-*]\s+.+$/gm) || [];
        bullets.forEach((bullet) => {
          const quote = cleanText(bullet.replace(/^\s*[-*]\s+/, ''));
          if (!quote) return;
          const snippet = quote.slice(0, 40);
          batch.drafts.push(toDraft(`Who said: "${snippet}..."?`, quote, 'key-quotes', options, block.id));
          batch.summary.summaryCount += 1;
        });
      }

      if ((headingMatch(heading, 'Memory Anchor') || headingMatch(heading, 'Memory Anchors')) && isEnabled('memory-anchor', options.sectionsEnabled)) {
        const anchor = cleanText(content);
        if (!anchor) return;
        batch.drafts.push(toDraft('What is the memory anchor for this reading?', anchor, 'memory-anchor', options, block.id));
        batch.summary.summaryCount += 1;
      }
    });
  });

  return batch;
}
