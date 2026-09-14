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
  ledgerUpdateFor,
  notificationTitle,
  resolveAudience,
  unresolvedLearnerIds,
  validateMessageInput,
} from '@/lib/services/events/organiser-message-service';
import {
  composeKey,
  tokenForCompose,
} from '@/lib/services/events/organiser-message-compose';

const TOKEN = '3f6b4c2e-9d51-4b7a-8c11-2f0a9e77d1b2';

/** A registration row, with the fields a test does not care about defaulted. */
const reg = (r: Partial<{ profile_id: string; learner_id: string; status: string }>) => ({
  profile_id: r.profile_id ?? null,
  learner_id: r.learner_id ?? null,
  status: r.status ?? null,
});

describe('resolveAudience', () => {
  it('writes only to registrations that are still live', () => {
    const audience = resolveAudience([
      reg({ profile_id: 'p1', status: 'registered' }),
      reg({ profile_id: 'p2', status: 'confirmed' }),
      reg({ profile_id: 'p3', status: 'checked_in' }),
      reg({ profile_id: 'p4', status: 'cancelled' }),
      reg({ profile_id: 'p5', status: 'no_show' }),
      reg({ profile_id: 'p6', status: 'waitlisted' }),
      reg({ profile_id: 'p7', status: 'pending' }),
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

  it('counts registrations it cannot match instead of quietly dropping them', () => {
    const audience = resolveAudience([
      reg({ profile_id: 'p1', status: 'registered' }),
      reg({ status: 'registered' }),
      reg({ status: 'confirmed' }),
      // Out of scope entirely — not counted as unreachable either.
      reg({ status: 'cancelled' }),
    ]);
    expect(audience.recipientIds).toEqual(['p1']);
    expect(audience.unreachable).toBe(2);
    expect(audience.audienceTotal).toBe(3);
  });

  it('tells one person once, however many times they registered', () => {
    const audience = resolveAudience([
      reg({ profile_id: 'p1', status: 'registered' }),
      reg({ profile_id: 'p1', status: 'confirmed' }),
    ]);
    expect(audience.recipientIds).toEqual(['p1']);
    // The audience total still reflects the registrations, not the people.
    expect(audience.audienceTotal).toBe(2);
    // …and nobody is unreachable, so the difference between the two numbers is
    // NOT the unreachable count. This is why unreachable is stored, not derived.
    expect(audience.unreachable).toBe(0);
  });

  it('treats a missing status as out of scope rather than as a recipient', () => {
    const audience = resolveAudience([reg({ profile_id: 'p1' })]);
    expect(audience.recipientIds).toEqual([]);
    expect(audience.audienceTotal).toBe(0);
  });

  it('returns an empty audience for an event nobody registered for', () => {
    expect(resolveAudience([])).toEqual({
      audienceTotal: 0,
      recipientIds: [],
      unreachable: 0,
      truncated: false,
    });
  });

  // ── Internal learners registered by learner_id, not profile_id ───────────
  // events_registrations carries profile_id, learner_id AND
  // external_participant_id — "one of these will be set". Reading profile_id
  // alone silently drops every learner filed by learner_id, and then tells the
  // organiser those people have no MyJKKN account. They do.

  it('reaches a learner registered by learner_id rather than profile_id', () => {
    const audience = resolveAudience(
      [
        reg({ profile_id: 'p1', status: 'registered' }),
        reg({ learner_id: 'L9', status: 'registered' }),
      ],
      { L9: 'p9' }
    );
    expect(audience.recipientIds.sort()).toEqual(['p1', 'p9']);
    expect(audience.unreachable).toBe(0);
  });

  it('counts a learner_id that resolves to nothing as unreachable, not as a recipient', () => {
    const audience = resolveAudience([reg({ learner_id: 'L404', status: 'registered' })], {});
    expect(audience.recipientIds).toEqual([]);
    expect(audience.unreachable).toBe(1);
  });

  it('tells one person once when they registered by profile AND by learner id', () => {
    const audience = resolveAudience(
      [
        reg({ profile_id: 'p9', status: 'registered' }),
        reg({ learner_id: 'L9', status: 'confirmed' }),
      ],
      { L9: 'p9' }
    );
    expect(audience.recipientIds).toEqual(['p9']);
    expect(audience.audienceTotal).toBe(2);
    expect(audience.unreachable).toBe(0);
  });

  it('reports a truncated read so the count is shown as a floor', () => {
    const audience = resolveAudience([reg({ profile_id: 'p1', status: 'registered' })], {}, true);
    expect(audience.truncated).toBe(true);
  });
});

describe('unresolvedLearnerIds', () => {
  it('asks only about in-scope registrations that are not already reachable', () => {
    expect(
      unresolvedLearnerIds([
        // Already reachable — no lookup needed.
        reg({ profile_id: 'p1', learner_id: 'L1', status: 'registered' }),
        // Worth looking up.
        reg({ learner_id: 'L2', status: 'confirmed' }),
        reg({ learner_id: 'L2', status: 'checked_in' }),
        // Out of scope — never messaged, so never looked up.
        reg({ learner_id: 'L3', status: 'cancelled' }),
        // Nothing to look up.
        reg({ status: 'registered' }),
      ])
    ).toEqual(['L2']);
  });

  it('asks about nothing for an empty registration list', () => {
    expect(unresolvedLearnerIds([])).toEqual([]);
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

// ───────────────────────────────────────────────────────────────────────────
// The double-send guard, at the point where a human actually double-sends
// ───────────────────────────────────────────────────────────────────────────
// A guard that holds everywhere except the failure path is not a guard: the
// failure path IS the path a person repeats. A request that times out in the
// browser may well have committed on the server, so the organiser is shown an
// error for a message that went out — and presses send again.

describe('compose token (double-send guard)', () => {
  const mintSeq = () => {
    let n = 0;
    return () => `token-${++n}`;
  };

  it('keeps the SAME token when the same message is retried after a failure', () => {
    const mint = mintSeq();
    const key = composeKey('Venue changed', 'We have moved to the main auditorium.');

    const first = tokenForCompose(null, key, mint);
    // …the send throws. The organiser presses send again, unchanged.
    const retry = tokenForCompose(first, key, mint);
    // …and again.
    const retryAgain = tokenForCompose(retry, key, mint);

    expect(retry.token).toBe(first.token);
    expect(retryAgain.token).toBe(first.token);
    // One token minted across three attempts: the UNIQUE (event_id,
    // client_token) constraint collapses all three onto one ledger row, and the
    // fanout key derived from it cannot deliver a second time.
    expect(first.token).toBe('token-1');
  });

  it('mints a new token once the message is actually edited', () => {
    const mint = mintSeq();
    const held = tokenForCompose(null, composeKey('Venue changed', 'Main auditorium.'), mint);
    const edited = tokenForCompose(held, composeKey('Venue changed', 'Seminar hall 2.'), mint);
    expect(edited.token).not.toBe(held.token);
  });

  it('mints a new token for the next message after a confirmed send clears the binding', () => {
    const mint = mintSeq();
    const first = tokenForCompose(null, composeKey('A', 'body'), mint);
    // A confirmed send sets the binding back to null.
    const second = tokenForCompose(null, composeKey('A', 'body'), mint);
    expect(second.token).not.toBe(first.token);
  });

  it('ignores surrounding whitespace, so a stray space is not a new message', () => {
    const mint = mintSeq();
    const held = tokenForCompose(null, composeKey('Venue changed', 'Main auditorium.'), mint);
    const padded = tokenForCompose(held, composeKey('  Venue changed ', ' Main auditorium.  '), mint);
    expect(padded.token).toBe(held.token);
  });

  it('does not confuse two messages that concatenate to the same string', () => {
    // Subject "a" + body "bc" must not key the same as subject "ab" + body "c".
    expect(composeKey('a', 'bc')).not.toBe(composeKey('ab', 'c'));
  });
});

describe('ledgerUpdateFor', () => {
  it('records a normal send at what the fanout actually wrote', () => {
    expect(
      ledgerUpdateFor({ delivered_count: 0, notification_id: null }, 34, {
        notified: 34,
        notificationId: 'n1',
      })
    ).toEqual({ delivered_count: 34, notification_id: 'n1' });
  });

  it('does NOT record a delivered message as "Delivered to 0" on the idempotent path', () => {
    // fanoutNotification returns notified:0 when it skips as idempotent — 0 rows
    // were INSERTED because the notification already existed — but it calls
    // ensureLinks() first, so every recipient holds it. Writing 0 here tells the
    // organiser the send failed and sends them straight back to press send
    // again: the exact duplicate blast the token guard exists to prevent.
    expect(
      ledgerUpdateFor({ delivered_count: 0, notification_id: null }, 34, {
        notified: 0,
        notificationId: 'n1',
        skipped: 'idempotent',
      })
    ).toEqual({ delivered_count: 34, notification_id: 'n1' });
  });

  it('never regresses a count that was already recorded higher', () => {
    expect(
      ledgerUpdateFor({ delivered_count: 40, notification_id: 'n1' }, 34, {
        notified: 0,
        notificationId: 'n1',
        skipped: 'idempotent',
      }).delivered_count
    ).toBe(40);
  });

  it('never clobbers a known notification id with null', () => {
    expect(
      ledgerUpdateFor({ delivered_count: 12, notification_id: 'n1' }, 12, { notified: 0 })
        .notification_id
    ).toBe('n1');
  });

  it('leaves a send that genuinely reached nobody visible as a failure', () => {
    // no_recipients: no notifications row, nothing delivered. isUndelivered()
    // then reports it as retryable, which is correct.
    const update = ledgerUpdateFor({ delivered_count: 0, notification_id: null }, 0, {
      notified: 0,
      skipped: 'no_recipients',
    });
    expect(update).toEqual({ delivered_count: 0, notification_id: null });
    expect(isUndelivered(update)).toBe(true);
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
