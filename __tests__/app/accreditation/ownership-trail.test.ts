import { describe, it, expect } from 'vitest';
import {
  isMissingRelation,
  sortEventsNewestFirst,
  filterEventsForScope,
  formatTrailDate,
  eventScopeLabel,
  ownershipEventSentence,
  accountabilityNote,
  assignRefusalReason,
  clearRefusalReason,
  type OwnershipEvent,
} from '@/app/(routes)/accreditation/manage/owners/_lib/ownership-trail';

// ---------------------------------------------------------------------------
// `accreditation_ownership_events` is built by a sibling lane and is NOT on
// jicate/main at the time these tests were written (verified by grep, 2026-09-08:
// zero references anywhere in the repo). So the missing-table path is not a
// hypothetical edge case here — it is the ONLY path this code takes today, and
// it has to end in "no history recorded yet" rather than a broken screen.
// ---------------------------------------------------------------------------

const ALICE = 'user-alice';
const BOB = 'user-bob';
const CARLA = 'user-carla';

const NAMES: Record<string, string> = {
  [ALICE]: 'Alice Menon',
  [BOB]: 'Bob Varghese',
  [CARLA]: 'Carla D’Souza',
};

/** Mirrors the page's own personLabel: never returns a raw id. */
const nameOf = (id: string | null) =>
  id ? (NAMES[id] ?? 'Owner assigned') : 'Nobody';

const event = (over: Partial<OwnershipEvent> = {}): OwnershipEvent => ({
  id: 'ev-1',
  owner_row_id: 'row-1',
  institution_id: 'inst-pharmacy',
  body_code: 'NAAC',
  metric_code: '3.1.1',
  action: 'assigned',
  from_user_id: null,
  to_user_id: BOB,
  actor_user_id: ALICE,
  actor_is_body_owner: true,
  note: null,
  created_at: '2026-09-08T06:30:00.000Z',
  ...over,
});

describe('isMissingRelation', () => {
  it('recognises the raw PostgreSQL undefined-table code', () => {
    expect(isMissingRelation({ code: '42P01', message: 'relation ... ' })).toBe(true);
  });

  it('recognises PostgREST schema-cache misses', () => {
    expect(
      isMissingRelation({
        code: 'PGRST205',
        message:
          "Could not find the table 'public.accreditation_ownership_events' in the schema cache",
      }),
    ).toBe(true);
  });

  it('recognises a missing RPC signature (PGRST202)', () => {
    // A /rpc/ 404 means the function could not be RESOLVED — absent, or present
    // with a different signature. Either way the assign path cannot run yet.
    expect(isMissingRelation({ code: 'PGRST202' })).toBe(true);
  });

  it('matches on message alone when no code is supplied', () => {
    expect(
      isMissingRelation({ message: 'relation "x" does not exist' }),
    ).toBe(true);
  });

  it('does NOT treat a real failure as a missing table', () => {
    // The dangerous direction: swallowing a genuine error would render
    // "no history recorded yet" about a trail that exists and could not be read.
    expect(isMissingRelation({ code: '42501', message: 'permission denied' })).toBe(
      false,
    );
    expect(isMissingRelation(new Error('Failed to fetch'))).toBe(false);
    expect(isMissingRelation(null)).toBe(false);
    expect(isMissingRelation('42P01')).toBe(false);
  });
});

describe('sortEventsNewestFirst', () => {
  it('puts the most recent change at the top', () => {
    const older = event({ id: 'a', created_at: '2026-09-01T00:00:00.000Z' });
    const newer = event({ id: 'b', created_at: '2026-09-08T00:00:00.000Z' });
    expect(sortEventsNewestFirst([older, newer]).map((e) => e.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('is stable for identical timestamps', () => {
    const a = event({ id: 'a', created_at: '2026-09-08T00:00:00.000Z' });
    const b = event({ id: 'b', created_at: '2026-09-08T00:00:00.000Z' });
    expect(sortEventsNewestFirst([a, b]).map((e) => e.id)).toEqual(['b', 'a']);
    expect(sortEventsNewestFirst([b, a]).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input', () => {
    const input = [
      event({ id: 'a', created_at: '2026-09-01T00:00:00.000Z' }),
      event({ id: 'b', created_at: '2026-09-08T00:00:00.000Z' }),
    ];
    sortEventsNewestFirst(input);
    expect(input.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('filterEventsForScope', () => {
  const naacBody = event({ id: 'body', metric_code: null });
  const naacMetric = event({ id: 'm311', metric_code: '3.1.1' });
  const naacOther = event({ id: 'm322', metric_code: '3.2.2' });
  const nirf = event({ id: 'nirf', body_code: 'NIRF', metric_code: 'RPC' });
  const all = [naacBody, naacMetric, naacOther, nirf];

  it('a body scope keeps every metric of that body and the body-level rows', () => {
    expect(
      filterEventsForScope(all, { bodyCode: 'NAAC' }).map((e) => e.id),
    ).toEqual(['body', 'm311', 'm322']);
  });

  it('never leaks another body', () => {
    expect(
      filterEventsForScope(all, { bodyCode: 'NAAC' }).some(
        (e) => e.body_code !== 'NAAC',
      ),
    ).toBe(false);
  });

  it('a metric scope keeps that metric AND the body-level rows above it', () => {
    // The accountable person above a delegated metric is exactly what this
    // screen exists to make visible, so the body row is not noise here.
    expect(
      filterEventsForScope(all, { bodyCode: 'NAAC', metricCode: '3.1.1' }).map(
        (e) => e.id,
      ),
    ).toEqual(['body', 'm311']);
  });

  it('treats an explicit null metricCode as the whole body', () => {
    expect(
      filterEventsForScope(all, { bodyCode: 'NAAC', metricCode: null }).map(
        (e) => e.id,
      ),
    ).toEqual(['body', 'm311', 'm322']);
  });
});

describe('formatTrailDate', () => {
  it('renders a readable day', () => {
    const out = formatTrailDate('2026-09-08T06:30:00.000Z');
    expect(out).toMatch(/2026/);
    expect(out).not.toMatch(/T\d\d:/);
  });

  it('says so rather than printing "Invalid Date"', () => {
    expect(formatTrailDate('not-a-date')).toBe('an unrecorded date');
  });
});

describe('eventScopeLabel', () => {
  it('names the metric when there is one', () => {
    expect(eventScopeLabel(event({ metric_code: '3.1.1' }))).toBe('NAAC 3.1.1');
  });

  it('says whole body for a body-level row', () => {
    expect(eventScopeLabel(event({ metric_code: null }))).toBe(
      'NAAC (whole body)',
    );
  });
});

describe('ownershipEventSentence', () => {
  it('says who assigned whom, and that the actor was the body owner', () => {
    const s = ownershipEventSentence(event(), nameOf);
    expect(s).toContain('Alice Menon made Bob Varghese the owner');
    expect(s).toContain('as the NAAC body owner');
    expect(s).toContain('2026');
  });

  it('drops the body-owner clause when the actor was not the body owner', () => {
    const s = ownershipEventSentence(
      event({ actor_is_body_owner: false }),
      nameOf,
    );
    expect(s).toContain('Alice Menon made Bob Varghese the owner');
    expect(s).not.toContain('body owner');
  });

  it('treats an unknown actor_is_body_owner as not claiming it', () => {
    // NULL means unrecorded, and asserting "as the body owner" from an
    // unrecorded flag would put an authority claim on the record that nothing
    // in the database supports.
    expect(
      ownershipEventSentence(event({ actor_is_body_owner: null }), nameOf),
    ).not.toContain('body owner');
  });

  it('names both people on a reassignment', () => {
    const s = ownershipEventSentence(
      event({ action: 'reassigned', from_user_id: BOB, to_user_id: CARLA }),
      nameOf,
    );
    expect(s).toContain('moved this from Bob Varghese to Carla D’Souza');
  });

  it('names who was removed when ownership is cleared', () => {
    const s = ownershipEventSentence(
      event({ action: 'cleared', from_user_id: BOB, to_user_id: null }),
      nameOf,
    );
    expect(s).toContain('removed Bob Varghese as owner');
    expect(s).not.toContain('Nobody as owner');
  });

  it('does not name the decliner twice', () => {
    const s = ownershipEventSentence(
      event({
        action: 'declined',
        actor_user_id: BOB,
        from_user_id: BOB,
        to_user_id: null,
        actor_is_body_owner: false,
      }),
      nameOf,
    );
    expect(s).toContain('Bob Varghese declined this');
    expect(s.match(/Bob Varghese/g)).toHaveLength(1);
  });

  it('renders a first open without an authority clause', () => {
    // Opening your own page needs no authority, so the body-owner note would
    // be answering a question nobody asked.
    const s = ownershipEventSentence(
      event({ action: 'seen', actor_user_id: BOB, actor_is_body_owner: true }),
      nameOf,
    );
    expect(s).toContain('Bob Varghese opened this for the first time');
    expect(s).not.toContain('body owner');
  });

  it('includes a note when one was left', () => {
    expect(
      ownershipEventSentence(event({ note: 'Handing 3.1.1 to the NSS lead' }), nameOf),
    ).toContain('Handing 3.1.1 to the NSS lead');
  });

  it('still renders an action this build has never heard of', () => {
    const s = ownershipEventSentence(event({ action: 'transferred' }), nameOf);
    expect(s).toContain('Alice Menon');
    expect(s).toContain('transferred');
  });

  it('never prints a raw user id', () => {
    const s = ownershipEventSentence(
      event({ actor_user_id: 'user-unknown', to_user_id: 'user-also-unknown' }),
      nameOf,
    );
    expect(s).not.toContain('user-unknown');
    expect(s).toContain('Owner assigned');
  });
});

describe('accountabilityNote', () => {
  it('names the body owner still answerable for a delegated metric', () => {
    expect(
      accountabilityNote({
        source: 'explicit',
        bodyCode: 'NAAC',
        metricOwnerUserId: BOB,
        bodyOwnerUserId: ALICE,
        bodyOwnerName: 'Alice Menon',
      }),
    ).toBe('NAAC owner Alice Menon remains accountable.');
  });

  it('says nothing when the body owner IS the metric owner', () => {
    expect(
      accountabilityNote({
        source: 'explicit',
        bodyCode: 'NAAC',
        metricOwnerUserId: ALICE,
        bodyOwnerUserId: ALICE,
        bodyOwnerName: 'Alice Menon',
      }),
    ).toBeNull();
  });

  it('flags a delegated metric with nobody above it', () => {
    expect(
      accountabilityNote({
        source: 'explicit',
        bodyCode: 'NIRF',
        metricOwnerUserId: BOB,
        bodyOwnerUserId: null,
        bodyOwnerName: null,
      }),
    ).toBe('NIRF has no owner — nobody above this metric is accountable.');
  });

  it('stays silent for inherited and unowned metrics', () => {
    for (const source of ['inherited', 'none'] as const) {
      expect(
        accountabilityNote({
          source,
          bodyCode: 'NAAC',
          metricOwnerUserId: ALICE,
          bodyOwnerUserId: ALICE,
          bodyOwnerName: 'Alice Menon',
        }),
      ).toBeNull();
    }
  });

  it('falls back to a phrase rather than a blank when the name is unknown', () => {
    expect(
      accountabilityNote({
        source: 'explicit',
        bodyCode: 'NAAC',
        metricOwnerUserId: BOB,
        bodyOwnerUserId: CARLA,
        bodyOwnerName: '',
      }),
    ).toBe('NAAC owner the body owner remains accountable.');
  });
});

describe('assignRefusalReason', () => {
  it('is silent for an IQAC coordinator', () => {
    expect(
      assignRefusalReason({ canManage: true, isBodyOwner: false, bodyCode: 'NAAC' }),
    ).toBeNull();
  });

  it('is silent for the body owner delegating within their own body', () => {
    expect(
      assignRefusalReason({ canManage: false, isBodyOwner: true, bodyCode: 'NAAC' }),
    ).toBeNull();
  });

  it('names both routes to the power for everyone else', () => {
    const msg = assignRefusalReason({
      canManage: false,
      isBodyOwner: false,
      bodyCode: 'NIRF',
    });
    expect(msg).toContain('NIRF');
    expect(msg).toContain('body owner');
    expect(msg).toContain('accreditation.naac.narrative.manage');
  });
});

describe('clearRefusalReason', () => {
  it('is silent for an IQAC coordinator', () => {
    expect(clearRefusalReason({ canManage: true, bodyCode: 'NAAC' })).toBeNull();
  });

  it('tells a body owner what they CAN do instead of only what they cannot', () => {
    const msg = clearRefusalReason({ canManage: false, bodyCode: 'NAAC' });
    expect(msg).toContain('hand it to somebody else');
    expect(msg).toContain('accountable');
  });
});
