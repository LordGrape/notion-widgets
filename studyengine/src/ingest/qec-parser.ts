import { createDraftId, type DraftCard, type IngestBatch, type ParseWarning } from './types';

type QecOptions = { originDocUrl?: string; lectureAttended: boolean; subCardsPerEBranch?: boolean };

type ENode = { label: string; text: string; depth: number; line: number };

function emptyBatch(): IngestBatch {
  return { drafts: [], warnings: [], summary: { qecCount: 0, summaryCount: 0, skipped: 0 } };
}

function cleanText(value: string): string {
  return String(value || '')
    .replace(/\{\s*color="[^"]+"\s*\}/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQLine(line: string): string | null {
  const hasYellow = /color="yellow"/i.test(line);
  if (!hasYellow) return null;
  const match = line.match(/\*\*\s*Q\.\s*([^*]+?)\s*\*\*/i);
  if (!match) return null;
  return cleanText(match[1]);
}

function parseELine(line: string): { label: string; text: string } | null {
  const m = line.match(/\*\*\s*E(\d+)([a-z])?(\d+)?\.\s*([^*]+?)\s*\*\*/i);
  if (!m) return null;
  const label = `E${m[1]}${m[2] || ''}${m[3] || ''}`;
  return { label, text: cleanText(m[4]) };
}

function parseCalloutBlock(lines: string[], start: number): { end: number; body: string; line: number } {
  const body: string[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (i > start && /<\/callout>/i.test(line)) break;
    if (i > start) body.push(line);
    i += 1;
  }
  return { end: i, body: body.join('\n'), line: start + 1 };
}

function parseCBody(rawBody: string): string | null {
  const match = rawBody.match(/\*\*\s*C\.\s*([\s\S]*?)\*\*/i);
  if (match) return cleanText(match[1]);
  return null;
}

function makeMainDraft(prompt: string, answer: string, snippets: string[], options: QecOptions, sourceBlockId: string): DraftCard {
  return {
    id: createDraftId(),
    prompt,
    modelAnswer: answer,
    groundingSnippets: snippets,
    source: {
      type: 'qec',
      originDocUrl: options.originDocUrl,
      sourceBlockId,
      lectureAttended: options.lectureAttended,
    },
  };
}

export function parseQecBlocks(markdown: string, options: QecOptions): IngestBatch {
  const batch = emptyBatch();
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');

  let currentQ: { prompt: string; line: number; sourceBlockId: string } | null = null;
  let eNodes: ENode[] = [];

  const finalizeWithoutC = (): void => {
    if (!currentQ) return;
    batch.warnings.push({
      severity: 'warn',
      sourceLine: currentQ.line,
      message: `Q at line ${currentQ.line} has no matching C callout — skipped`,
    });
    batch.summary.skipped += 1;
    currentQ = null;
    eNodes = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const qText = parseQLine(line);
    if (qText) {
      if (currentQ) finalizeWithoutC();
      currentQ = { prompt: qText, line: i + 1, sourceBlockId: `q-line-${i + 1}` };
      eNodes = [];
      continue;
    }

    const e = parseELine(line);
    if (e && currentQ) {
      const indent = line.match(/^\s*/)?.[0] || '';
      const depth = Math.floor(indent.replace(/ {2}/g, '\t').length);
      eNodes.push({ label: e.label, text: e.text, depth, line: i + 1 });
      continue;
    }

    if (/<callout[^>]*icon="💡"[^>]*color="green"[^>]*>/i.test(line)) {
      const callout = parseCalloutBlock(lines, i);
      i = callout.end;
      const cBody = parseCBody(callout.body);
      if (!currentQ) {
        batch.warnings.push({ severity: 'warn', sourceLine: callout.line, message: `C callout at line ${callout.line} has no preceding Q — skipped` });
        batch.summary.skipped += 1;
        continue;
      }
      if (cBody == null) {
        batch.warnings.push({ severity: 'warn', sourceLine: callout.line, message: `Q at line ${currentQ.line} has no matching C callout — skipped` });
        batch.summary.skipped += 1;
        currentQ = null;
        eNodes = [];
        continue;
      }
      if (!cBody.trim()) {
        batch.warnings.push({
          severity: 'warn',
          sourceLine: currentQ.line,
          message: `Q at line ${currentQ.line} has empty C callout — ask Notion AI to complete the conclusion in the source page, then re-harvest`,
        });
        batch.summary.skipped += 1;
        currentQ = null;
        eNodes = [];
        continue;
      }

      const snippets = eNodes.map((node) => `${node.label}. ${node.text}`);
      batch.drafts.push(makeMainDraft(currentQ.prompt, cBody, snippets, options, currentQ.sourceBlockId));
      batch.summary.qecCount += 1;

      if (options.subCardsPerEBranch) {
        const roots = eNodes.filter((node) => /^E\d+$/.test(node.label));
        roots.forEach((root) => {
          const rootPrefix = root.label;
          const branchNodes = eNodes.filter((node) => node.label === rootPrefix || node.label.startsWith(rootPrefix));
          const modelAnswer = branchNodes.map((node) => `${node.label}. ${node.text}`).join('\n');
          batch.drafts.push({
            id: createDraftId(),
            prompt: `What is the ${root.text} approach to ${currentQ?.prompt.replace(/\?$/, '')}?`,
            modelAnswer,
            groundingSnippets: branchNodes.map((node) => `${node.label}. ${node.text}`),
            warnings: ['auto-generated sub-card from E branch — review prompt phrasing'],
            source: {
              type: 'qec',
              originDocUrl: options.originDocUrl,
              sourceBlockId: `${currentQ?.sourceBlockId}:${rootPrefix}`,
              lectureAttended: options.lectureAttended,
            },
          });
        });
      }

      currentQ = null;
      eNodes = [];
    }
  }

  if (currentQ) finalizeWithoutC();
  return batch;
}
