import { describe, expect, it } from 'vitest';
import { parseQecBlocks } from './qec-parser';

const nationalismFixture = `- {color="yellow"} **Q. What is the source of nationalism?**
	- **E1. cultural approach**
		- **E1a. hardcore primordialism says nations are ancient natural communities**
	- **E2. political approach**
		- **E2a. modernists argue nationalism is produced by modern state-building**
	- **E3. mixed approach**
		- **E3a. ethno-symbolists retain premodern myths**
		- **E3b. but stress modern reinterpretation by elites**
<callout icon="💡" color="green">
**C. There is no single origin; nationalism emerges through cultural memory, political construction, and mixed pathways.**
</callout>`;

describe('parseQecBlocks', () => {
  it('parses nationalism exemplar', () => {
    const result = parseQecBlocks(nationalismFixture, { lectureAttended: true });
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0].prompt).toBe('What is the source of nationalism?');
    expect(result.drafts[0].modelAnswer.toLowerCase()).toContain('no single origin');
    expect(result.drafts[0].groundingSnippets).toHaveLength(7);
  });

  it('parses three QEC blocks on one page', () => {
    const fixture = `${nationalismFixture}\n\n- {color="yellow"} **Q. Why do empires collapse?**\n<callout icon="💡" color="green">\n**C. Institutional overreach and fiscal strain drive collapse.**\n</callout>\n\n- {color="yellow"} **Q. What is deterrence?**\n<callout icon="💡" color="green">\n**C. Deterrence is preventing action through credible cost.**\n</callout>`;
    const result = parseQecBlocks(fixture, { lectureAttended: true });
    expect(result.drafts).toHaveLength(3);
    expect(result.summary.qecCount).toBe(3);
  });

  it('skips empty C callout', () => {
    const fixture = `- {color="yellow"} **Q. Test?**\n<callout icon="💡" color="green">\n**C.   **\n</callout>`;
    const result = parseQecBlocks(fixture, { lectureAttended: false });
    expect(result.drafts).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.summary.skipped).toBe(1);
  });

  it('warns on Q without C', () => {
    const fixture = `- {color="yellow"} **Q. Missing C?**`;
    const result = parseQecBlocks(fixture, { lectureAttended: true });
    expect(result.drafts).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('creates E-branch subcards when enabled', () => {
    const result = parseQecBlocks(nationalismFixture, { lectureAttended: true, subCardsPerEBranch: true });
    expect(result.drafts).toHaveLength(4);
  });

  it('requires yellow color on Q line', () => {
    const fixture = `- **Q. Should not parse**\n<callout icon="💡" color="green">\n**C. Nope**\n</callout>`;
    const result = parseQecBlocks(fixture, { lectureAttended: true });
    expect(result.drafts).toHaveLength(0);
  });
});
