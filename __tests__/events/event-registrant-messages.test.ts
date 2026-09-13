// __tests__/events/event-registrant-messages.test.ts
//
// Cover for the decisions the "Message registrants" surface makes on its own,
// before any database is involved:
//
//   1. WHO gets a message — the status filter, the profile-less registrant, and
//      the same person registered twice.
//   2. WHAT counts as a valid compose — including the idempotency token, which
//      is the whole double-send defence.
//   3. WHEN a recorded send may be retried — a row whose fanout never completed
//      must be retryable; one that delivered must not be.
//
// The service also talks to Supabase; those functions are not exercised here.
// Everything below is pure.

import { describe, it, expect } from 'vitest';

import {
  MESSAGEABLE_STATUSES,
  BODY_MAX,
  SUBJECT_MAX,
  fanoutKey,
  isUndelivered,
  notificationTitle,
  resolveAudience,
  validateMessageInput,
} from '@/lib/services/events/organiser-message-service';

const TOKEN = '3f6b4c2e-9d51-4b7a-8c11-2f0a9e77d1b2';

describe('resolveAudience', () => {
  it('writes only to registrations that are still live', () => {
    const audience = resolveAudience([
      { profile_id: 'p1', status: 'registered' },
      { profile_id: 'p2', status: 'confirmed' },
      { profile_id: 'p3', status: 'checked_in' },
      { profile_id: 'p4', status: 'cancelled' },
      { profile_id: 'p5', status: 'no_show' },
      { profile_id: 'p6', status: 'waitlisted' },
      { profile_id: 'p7', status: 'pending' },
    ]);
    expect(audience.recipientIds.sort()).toEqual(['p1', 'p2', 'p3']);
    expect(audience.audienceTotal).toBe(3);
  });

  it('uses the same statuses the module already notifies on', () => {
    // app/api/events/notify/route.ts filters event_schedule_changed on exactly
    // these three. Two answers to "who hears about this event" would be one too
    // many.
    expect([...MESSAGEABLE_STATUSES]).toEqual(['registered', 'confirmed', 'checked_in']);
  });

  it('counts registrants with no account instead of quietly dropping them', () => {
    const audience = resolveAudience([
      { profile_id: 'p1', status: 'registered' },
      { profile_id: null, status: 'registered' },
      { profile_id: null, status: 'confirmed' },
      // Out of scope entirely — not counted as unreachable either.
      { profile_id: null, status: 'cancelled' },
    ]);
    expect(audience.recipientIds).toEqual(['p1']);
    expect(audience.unreachable).toBe(2);
    expect(audience.audienceTotal).toBe(3);
  });

  it('tells one person once, however many times they registered', () => {
    const audience = resolveAudience([
      { profile_id: 'p1', status: 'registered' },
      { profile_id: 'p1', status: 'confirmed' },
    ]);
    expect(audience.recipientIds).toEqual(['p1']);
    // The audience total still reflects the registrations, not the people.
    expect(audience.audienceTotal).toBe(2);
  });

  it('treats a missing status as out of scope rather than as a recipient', () => {
    const audience = resolveAudience([{ profile_id: 'p1', status: null }]);
    expect(audience.recipientIds).toEqual([]);
    expect(audience.audienceTotal).toBe(0);
  });

  it('returns an empty audience for an event nobody registered for', () => {
    expect(resolveAudience([])).toEqual({
      audienceTotal: 0,
      recipientIds: [],
      unreachable: 0,
    });
  });
});

describe('validateMessageInput', () => {
  it('accepts a normal message and trims it', () => {
    const parsed = validateMessageInput({
      subject: '  Venue changed  ',
      body: '  We have moved to the main auditorium.  ',
      clientToken: TOKEN,
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.error).toBeNull();
    expect(parsed.value.subject).toBe('Venue changed');
    expect(parsed.value.body).toBe('We have moved to the main auditorium.');
  });

  it('refuses an empty subject or an empty body, and says which', () => {
    const noSubject = validateMessageInput({ subject: '   ', body: 'x', clientToken: TOKEN });
    expect(noSubject.ok).toBe(false);
    expect(noSubject.error).toMatch(/subject/i);

    const noBody = validateMessageInput({ subject: 'x', body: '   ', clientToken: TOKEN });
    expect(noBody.ok).toBe(false);
    expect(noBody.error).toMatch(/message/i);
  });

  it('refuses over-long copy at the documented limits', () => {
    expect(
      validateMessageInput({ subject: 'a'.repeat(SUBJECT_MAX + 1), body: 'x', clientToken: TOKEN }).ok
    ).toBe(false);
    expect(
      validateMessageInput({ subject: 'x', body: 'a'.repeat(BODY_MAX + 1), clientToken: TOKEN }).ok
    ).toBe(false);
    // Exactly at the limit is fine.
    expect(
      validateMessageInput({ subject: 'a'.repeat(SUBJECT_MAX), body: 'x', clientToken: TOKEN }).ok
    ).toBe(true);
  });

  it('refuses a missing or malformed idempotency token', () => {
    // Without a usable token the UNIQUE constraint cannot collapse a double
    // submit, so a send with no token is a send that could repeat itself.
    for (const clientToken of ['', 'not-a-uuid', '3f6b4c2e9d514b7a8c112f0a9e77d1b2']) {
      expect(validateMessageInput({ subject: 'x', body: 'y', clientToken }).ok).toBe(false);
    }
  });

  it('refuses a null payload rather than throwing', () => {
    expect(validateMessageInput(null).ok).toBe(false);
    expect(validateMessageInput(undefined).ok).toBe(false);
  });
});

describe('retry judgement', () => {
  it('treats a row whose fanout never completed as retryable', () => {
    expect(isUndelivered({ notification_id: null, delivered_count: 0 })).toBe(true);
  });

  it('treats a delivered row as final', () => {
    expect(isUndelivered({ notification_id: 'n1', delivered_count: 4 })).toBe(false);
    // A notifications row exists — the links may simply have been healed to 0
    // new rows on an idempotent replay. Still not a fresh send.
    expect(isUndelivered({ notification_id: 'n1', delivered_count: 0 })).toBe(false);
  });

  it('keys the fanout off the ledger row, so a retry cannot deliver twice', () => {
    expect(fanoutKey('row-1')).toBe('events:registrant_message:row-1');
    expect(fanoutKey('row-1')).not.toBe(fanoutKey('row-2'));
  });
});

describe('notificationTitle', () => {
  it('names the event so the bell is readable out of context', () => {
    expect(notificationTitle('Sports Meet 2026', 'Venue changed')).toBe(
      'Sports Meet 2026: Venue changed'
    );
  });

  it('falls back to a sentence rather than printing an empty name', () => {
    expect(notificationTitle('   ', 'Venue changed')).toBe('your event: Venue changed');
  });
});
