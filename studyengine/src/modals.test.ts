import { describe, expect, it } from 'vitest';
import { isFeatureEnabled, planProfileOptionsHtml } from './modals';

describe('feature gated profile options', () => {
  it('hides language profile when run5Language is disabled', () => {
    const html = planProfileOptionsHtml({ run5Language: false });
    expect(html).not.toContain('value="language"');
  });

  it('treats run6Adaptive false as disabled state', () => {
    expect(isFeatureEnabled({ run6Adaptive: false }, 'run6Adaptive')).toBe(false);
    expect(isFeatureEnabled({ run6Adaptive: true }, 'run6Adaptive')).toBe(true);
  });
});
