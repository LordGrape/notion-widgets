import { describe, expect, it } from 'vitest';

import { validateAuth } from '../src/auth';

describe('validateAuth for /studyengine/gloss', () => {
  it('returns 401 when missing widget key', () => {
    const req = new Request('http://localhost/studyengine/gloss', { method: 'POST' });
    const res = validateAuth(req, { WIDGET_SECRET: 'abc' } as any, '/studyengine/gloss');
    expect(res?.status).toBe(401);
  });
});
