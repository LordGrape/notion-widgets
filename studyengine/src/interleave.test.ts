import { describe, expect, it, vi } from 'vitest';
import { interleaveQuickFireQueue } from './interleave';

function card(id: string, subDeck: string, parentCardId?: string) {
  return { id, subDeck, parentCardId } as any;
}

describe('interleaveQuickFireQueue', () => {
  it('passes through for queues <= 2', () => {
    const items = [card('a', 's1'), card('b', 's1')];
    expect(interleaveQuickFireQueue(items)).toBe(items);
  });

  it('satisfies constraints when feasible', () => {
    const items = [
      card('a1', 's1'), card('a2', 's1'),
      card('b1', 's2'), card('b2', 's2'),
      card('c1', 's3'), card('c2', 's3'),
      card('d1', 's4'), card('d2', 's4'),
      card('e1', 's5', 'fam1'), card('e2', 's6', 'fam1')
    ];
    const out = interleaveQuickFireQueue(items);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].subDeck).not.toBe(out[i - 1].subDeck);
      const pk = out[i].parentCardId || `u:${out[i].id}`;
      const prev = out[i - 1].parentCardId || `u:${out[i - 1].id}`;
      expect(pk).not.toBe(prev);
    }
  });

  it('warns and falls back when infeasible with one subdeck', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const items = [card('a', 's1'), card('b', 's1'), card('c', 's1')];
    const out = interleaveQuickFireQueue(items);
    expect(out).toHaveLength(3);
    expect(warn).toHaveBeenCalled();
  });

  it('rejects family collisions in adjacent slots', () => {
    const items = [
      card('a', 's1', 'root1'),
      card('b', 's2', 'root1'),
      card('c', 's3', 'root2'),
      card('d', 's4', 'root3')
    ];
    const out = interleaveQuickFireQueue(items);
    for (let i = 1; i < out.length; i++) {
      expect((out[i].parentCardId || out[i].id)).not.toBe(out[i - 1].parentCardId || out[i - 1].id);
    }
  });
});
