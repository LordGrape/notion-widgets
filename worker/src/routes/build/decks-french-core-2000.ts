// L1b-alpha-hotfix: read assembled french-core-2000 deck from KV.
import type { Env } from '../../types';
import { BUILD_KEYS, kvGetJson } from '../../lib/french-core';

export async function handleDeckFrenchCore2000(_request: Request, env: Env): Promise<Response> {
  const [deck, meta] = await Promise.all([
    kvGetJson<unknown[]>(env.WIDGET_KV, BUILD_KEYS.deck),
    kvGetJson<Record<string, unknown>>(env.WIDGET_KV, BUILD_KEYS.deckMeta),
  ]);
  if (!deck) {
    return new Response(JSON.stringify({ error: 'Deck not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ id: 'french-core-2000', meta: meta || null, cards: deck }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
  });
}
