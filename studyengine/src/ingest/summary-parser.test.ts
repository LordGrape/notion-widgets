import { describe, expect, it } from 'vitest';
import { parseNotionAiSummaries } from './summary-parser';

const detailsFixture = `<details>
### Key Concepts & Definitions
| Term | Definition |
| --- | --- |
| Realism | States seek survival under anarchy |
### Important Arguments
- Institutions reduce transaction costs.
  - Evidence: repeated bargaining.
### Exam-Ready Facts
- 1648 Peace of Westphalia is a canonical sovereignty marker.
### Essay Hooks & Integration
- Contrast realism with constructivism in intro and conclusion.
### Key Quotes
- "Anarchy is what states make of it" — Wendt, social constructivism.
### Memory Anchors
A world chessboard where norms repaint the rules.
</details>`;

describe('parseNotionAiSummaries', () => {
  it('covers each section type', () => {
    const result = parseNotionAiSummaries(detailsFixture, {
      sectionsEnabled: {
        'key-concepts': true,
        'important-arguments': true,
        'exam-ready-facts': true,
        'essay-hooks': true,
        'key-quotes': true,
        'memory-anchor': true,
      },
    });
    expect(result.summary.summaryCount).toBe(6);
  });

  it('applies default toggles', () => {
    const result = parseNotionAiSummaries(detailsFixture, { sectionsEnabled: {} });
    const sections = result.drafts.map((d) => d.source.type === 'notion-ai-summary' ? d.source.sourceSection : '');
    expect(sections).toEqual(expect.arrayContaining(['key-concepts', 'exam-ready-facts', 'memory-anchor']));
    expect(sections).not.toContain('important-arguments');
    expect(sections).not.toContain('essay-hooks');
    expect(sections).not.toContain('key-quotes');
  });

  it('all toggles on includes all sections', () => {
    const result = parseNotionAiSummaries(detailsFixture, {
      sectionsEnabled: {
        'key-concepts': true,
        'important-arguments': true,
        'exam-ready-facts': true,
        'essay-hooks': true,
        'key-quotes': true,
        'memory-anchor': true,
      },
    });
    expect(result.drafts).toHaveLength(6);
  });

  it('handles multi-summary page and distinct block ids', () => {
    const page = `${detailsFixture}\n\n${detailsFixture}\n\n${detailsFixture}`;
    const result = parseNotionAiSummaries(page, { sectionsEnabled: { 'key-concepts': true, 'exam-ready-facts': true, 'memory-anchor': true } });
    const ids = new Set(result.drafts.map((d) => d.source.type === 'notion-ai-summary' ? d.source.summaryBlockId : ''));
    expect(ids.size).toBe(3);
  });
});
