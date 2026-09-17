// __tests__/meetings/booking-context.test.ts
//
// The rules that decide what a visitor must say before taking a long slot.
// These are checked here rather than through the route because three surfaces
// share them — the booking page, the embed, and the route — and a rule that is
// only true in one of them is not a rule.

import { describe, it, expect } from 'vitest';

import {
  LONG_MEETING_MIN,
  contextQuestionsFor,
  isLongMeeting,
  checkBookingContext,
  contextLabelFor,
} from '@/lib/services/meetings/booking-context';

const longAnswers = {
  note: 'I need a decision on whether the AHS block can run the new duty rota from October, and who signs it off.',
  background:
    'I have spoken to the HOD and to accounts; the rota is drafted and costed, and the only open point is approval.',
  why_this_long: 'Three people have to agree in the same room and the costing needs walking through.',
};

describe('which form a length asks for', () => {
  it('a short meeting asks one question', () => {
    expect(contextQuestionsFor(15)).toHaveLength(1);
    expect(isLongMeeting(15)).toBe(false);
  });

  it('an hour asks the long form', () => {
    expect(isLongMeeting(60)).toBe(true);
    expect(contextQuestionsFor(60).map((q) => q.key)).toEqual(['note', 'background', 'why_this_long']);
  });

  it('the boundary itself counts as long', () => {
    expect(isLongMeeting(LONG_MEETING_MIN)).toBe(true);
    expect(isLongMeeting(LONG_MEETING_MIN - 1)).toBe(false);
  });

  it('a missing or nonsense duration is treated as short, never refused', () => {
    // A booking that cannot say how long it is must not become unbookable.
    expect(isLongMeeting(null)).toBe(false);
    expect(isLongMeeting(undefined)).toBe(false);
    expect(isLongMeeting(0)).toBe(false);
    expect(isLongMeeting(-5)).toBe(false);
  });
});

describe('checking what was written', () => {
  it('accepts a short booking with one line', () => {
    const res = checkBookingContext(15, { note: 'Admission query for my daughter' });
    expect(res).toMatchObject({ ok: true });
    expect(res.answers).toEqual({ note: 'Admission query for my daughter' });
  });

  it('refuses a short booking with nothing at all — the old browser-only rule', () => {
    expect(checkBookingContext(15, {})).toMatchObject({ ok: false, key: 'note' });
    expect(checkBookingContext(15, { note: '   ' })).toMatchObject({ ok: false, key: 'note' });
  });

  it('refuses an hour answered with one character', () => {
    const res = checkBookingContext(60, { note: 'x' });
    expect(res).toMatchObject({ ok: false, key: 'note' });
  });

  it('refuses an hour that answers only the first question', () => {
    const res = checkBookingContext(60, { note: longAnswers.note });
    expect(res).toMatchObject({ ok: false, key: 'background' });
  });

  it('accepts an hour that answers all three', () => {
    const res = checkBookingContext(60, longAnswers);
    expect(res.ok).toBe(true);
    expect(Object.keys(res.answers)).toEqual(['note', 'background', 'why_this_long']);
  });

  it('drops keys the form did not ask for', () => {
    // The body is written by a page the caller controls, and the host's meeting
    // screen renders these keys back. Anything unasked-for is not stored.
    const res = checkBookingContext(60, { ...longAnswers, injected: 'see me on the host screen' });
    expect(res.ok).toBe(true);
    expect(res.answers).not.toHaveProperty('injected');
  });

  it('trims, and keeps note first so the calendar description still finds it', () => {
    const res = checkBookingContext(60, {
      ...longAnswers,
      note: `   ${longAnswers.note}   `,
    });
    expect(res.ok).toBe(true);
    expect(res.answers.note).toBe(longAnswers.note);
    expect(Object.keys(res.answers)[0]).toBe('note');
  });

  it('caps a very long answer rather than refusing it', () => {
    const res = checkBookingContext(60, { ...longAnswers, background: 'b'.repeat(5000) });
    expect(res.ok).toBe(true);
    expect(res.answers.background).toHaveLength(2000);
  });
});

describe('labels on the host screen', () => {
  it('names a known key', () => {
    expect(contextLabelFor('why_this_long')).toMatch(/twenty minutes/i);
  });

  it('shows an unknown key as written — the old routed form stored questions as keys', () => {
    expect(contextLabelFor('Which programme are you asking about?')).toBe(
      'Which programme are you asking about?',
    );
  });
});
