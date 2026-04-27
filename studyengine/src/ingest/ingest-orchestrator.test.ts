import { describe, expect, it } from 'vitest';
import { harvestFromNotionMarkdown } from './ingest-orchestrator';

const mixedFixture = `- {color="yellow"} **Q. Q1?**
<callout icon="💡" color="green">
**C. A1**
</callout>
- {color="yellow"} **Q. Q2?**
<callout icon="💡" color="green">
**C. A2**
</callout>
- {color="yellow"} **Q. Q3?**
<callout icon="💡" color="green">
**C. A3**
</callout>
<details>
### Key Concepts & Definitions
| Term | Definition |
| --- | --- |
| Concept A | Def A |
### Exam-Ready Facts
- Fact A.
### Memory Anchor
Anchor A.
</details>
<details>
### Key Concepts & Definitions
| Term | Definition |
| --- | --- |
| Concept B | Def B |
### Exam-Ready Facts
- Fact B.
### Memory Anchor
Anchor B.
</details>`;

describe('harvestFromNotionMarkdown', () => {
  it('merges qec + summary drafts', () => {
    const result = harvestFromNotionMarkdown(mixedFixture, {
      lectureAttended: true,
      sectionsEnabled: { 'key-concepts': true, 'exam-ready-facts': true, 'memory-anchor': true },
    });
    expect(result.summary.qecCount).toBe(3);
    expect(result.summary.summaryCount).toBe(6);
    expect(result.drafts.length).toBeGreaterThan(3);
  });

  it('dedupes identical prompt per source type', () => {
    const fixture = `- {color="yellow"} **Q. Same prompt**\n<callout icon="💡" color="green">\n**C. one**\n</callout>\n- {color="yellow"} **Q. Same prompt**\n<callout icon="💡" color="green">\n**C. two**\n</callout>`;
    const result = harvestFromNotionMarkdown(fixture, { lectureAttended: true });
    expect(result.drafts).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
