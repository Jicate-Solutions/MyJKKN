// __tests__/events/event-waitlist.test.ts
//
// Cover for the decisions the waiting list makes on its own, before any
// database is involved:
//
//   1. WHAT NUMBER a queued person is shown — the rank among people still
//      waiting, not the stored join order. Getting this wrong tells somebody
//      they are 7th when they are 2nd.
//   2. WHERE an offer appears — first, always. An offer holds a place and has
//      no deadline, so a stalled one is the only row on the organiser's screen
//      that can quietly cost the event a seat.
//   3. WHETHER A MISSING TABLE IS AN ERROR — it is not. Migrations here apply
//      after the code deploys, and the whole safety of this feature rests on
//      that window degrading to today's behaviour rather than breaking public
//      registration for every event.
//
// The service also talks to Supabase; those functions are not exercised here.
// Everything below is pure.

import { describe, it, expect } from 'vitest';

import {
  isMissingObject,
  orderQueue,
  queuedMessage,
} from '@/lib/services/events/waitlist-service';

function row(
  overrides: Partial<Parameters<typeof orderQueue>[0][number]> & { queue_seq: number }
) {
  return {
    id: `w-${overrides.queue_seq}`,
    status: 'waiting',
    participant_name: `Person ${overrides.queue_seq}`,
    joined_at: '2026-09-13T10:00:00.000Z',
    ...overrides,
  };
}

describe('orderQueue — the position a person is shown', () => {
  it('ranks by order in the queue, not by the stored join number', () => {
    // Joiners 1 and 2 have left; 3, 7 and 9 are still waiting. The person who
    // joined 9th is third in line, and must be shown 3.
    const entries = orderQueue([row({ queue_seq: 3 }), row({ queue_seq: 7 }), row({ queue_seq: 9 })]);

    expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.queue_seq)).toEqual([3, 7, 9]);
  });

  it('ranks correctly even when the rows arrive out of order', () => {
    const entries = orderQueue([row({ queue_seq: 9 }), row({ queue_seq: 3 }), row({ queue_seq: 7 })]);

    expect(entries.map((e) => e.queue_seq)).toEqual([3, 7, 9]);
    expect(entries.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it('gives an offered row no position — it is past the queue, not in it', () => {
    const entries = orderQueue([
      row({ queue_seq: 1, status: 'offered', offered_at: '2026-09-13T09:00:00.000Z' }),
      row({ queue_seq: 2 }),
      row({ queue_seq: 3 }),
    ]);

    expect(entries[0].status).toBe('offered');
    expect(entries[0].position).toBeNull();
    // The people still waiting start at 1 — an outstanding offer does not push
    // the front of the queue down to "number 2".
    expect(entries.filter((e) => e.status === 'waiting').map((e) => e.position)).toEqual([1, 2]);
  });
});

describe('orderQueue — where an offer appears', () => {
  it('puts every offer above everyone still waiting', () => {
    const entries = orderQueue([
      row({ queue_seq: 1 }),
      row({ queue_seq: 2 }),
      row({ queue_seq: 8, status: 'offered', offered_at: '2026-09-13T09:00:00.000Z' }),
    ]);

    expect(entries[0].queue_seq).toBe(8);
    expect(entries[0].status).toBe('offered');
    expect(entries.slice(1).map((e) => e.queue_seq)).toEqual([1, 2]);
  });

  it('keeps queue order within each group', () => {
    const entries = orderQueue([
      row({ queue_seq: 5 }),
      row({ queue_seq: 2, status: 'offered' }),
      row({ queue_seq: 4 }),
      row({ queue_seq: 1, status: 'offered' }),
    ]);

    expect(entries.map((e) => e.queue_seq)).toEqual([1, 2, 4, 5]);
    expect(entries.map((e) => e.status)).toEqual(['offered', 'offered', 'waiting', 'waiting']);
  });

  it('reads unreachable as a strict boolean, so a null never reads as reachable-unknown', () => {
    const [a, b, c] = orderQueue([
      row({ queue_seq: 1, unreachable: true }),
      row({ queue_seq: 2, unreachable: null }),
      row({ queue_seq: 3 }),
    ]);

    expect(a.unreachable).toBe(true);
    expect(b.unreachable).toBe(false);
    expect(c.unreachable).toBe(false);
  });
});

describe('queuedMessage — what the person is told', () => {
  it('never says the word "full" without also saying what happens next', () => {
    for (const position of [null, 1, 2, 17]) {
      const message = queuedMessage(position);
      expect(message.toLowerCase()).toContain('waiting list');
    }
  });

  it('names the position when there is one', () => {
    expect(queuedMessage(7)).toContain('number 7');
  });

  it('says "first" rather than "number 1"', () => {
    expect(queuedMessage(1)).toContain('first');
    expect(queuedMessage(1)).not.toContain('number 1');
  });

  it('degrades to a position-less sentence rather than saying "number 0"', () => {
    expect(queuedMessage(null)).not.toContain('number');
    expect(queuedMessage(0)).not.toContain('number');
  });
});

describe('isMissingObject — the deploy-before-apply window', () => {
  it('treats a missing relation as "no waiting list yet"', () => {
    expect(isMissingObject({ code: '42P01', message: 'relation does not exist' })).toBe(true);
    expect(isMissingObject({ code: 'PGRST205', message: 'Could not find the table' })).toBe(true);
  });

  it('treats a missing function the same way — the gate ships in the same migration', () => {
    expect(isMissingObject({ code: '42883' })).toBe(true);
    expect(isMissingObject({ code: 'PGRST202' })).toBe(true);
  });

  it('recognises the schema-cache wording PostgREST uses before a reload', () => {
    expect(
      isMissingObject({ message: "Could not find the table in the schema cache" })
    ).toBe(true);
  });

  it('does NOT swallow a real failure', () => {
    expect(isMissingObject({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingObject({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isMissingObject(null)).toBe(false);
  });
});
