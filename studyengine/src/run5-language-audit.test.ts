// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { planProfileOptionsHtml } from './modals';

const html = readFileSync(resolve(__dirname, '..', 'studyengine.html'), 'utf8');

describe('run5 language gating audit paths', () => {
  it('card editor modal (regular flow) hides language option when run5Language is false', () => {
    const options = planProfileOptionsHtml({ run5Language: false });
    expect(options).not.toContain('value="language"');
  });

  it('card editor modal (autofill-driven flow) uses the same gated selector helper', () => {
    const options = planProfileOptionsHtml({ run5Language: false });
    expect(options).not.toContain('>Language<');
  });

  it('sub-deck editor modal gates language option by run5 toggle', () => {
    expect(html).toMatch(/isRun5LanguageEnabled\(\) \? \('\<option value="language"'/);
  });

  it('course editor modal gates language option by run5 toggle', () => {
    expect(html).toMatch(/if \(isRun5LanguageEnabled\(\)\) inner \+= '\<option value="language"'/);
  });

  it('sub-deck wizard creation flow does not render an ungated language option', () => {
    const wizardSlice = html.slice(html.indexOf('cm_newOverlaySubDeckName'), html.indexOf('data-overlay-subdeck-save'));
    expect(wizardSlice).toContain("isRun5LanguageEnabled() ? ('<option value=\"language\"'");
  });

  it('bulk-edit multi-select path does not expose an ungated language option', () => {
    expect(html).not.toContain('<option value="language">Language</option>');
  });

  it('card library inline edit path has no language selector rendered', () => {
    const editSlice = html.slice(html.indexOf('window.editCard = function'), html.indexOf('window.viewCourseDeck = function'));
    expect(editSlice).not.toContain('Language</option>');
  });
});
