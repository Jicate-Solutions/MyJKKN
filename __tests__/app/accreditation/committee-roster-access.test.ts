import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  decideCommitteeListAccess,
  decideCommitteeDetailAccess,
  isSeatCurrent,
  formatTermEnd,
  COMMITTEE_ACCESS_CONTACT,
  COMMITTEE_TERM_RENEWAL_CONTACT,
} from '@/app/(routes)/accreditation/naac/committees/_lib/committee-access';

// ---------------------------------------------------------------------------
// Director decision 8 — "access to committee pages follows committee-roster
// membership, not job title."
// Director decision 7 — "committee access must be cut off AUTOMATICALLY on the
// member's term end date, and a term end date must be REQUIRED when adding a
// member."
//
// These assert what a viewer is TOLD and whether the door opens. They do not
// re-derive the RLS expression: a test that re-implements the SQL only proves
// this file agrees with itself, which is how this project has twice shipped a
// live bug under green tests. The database half is proved behaviourally — the
// three-way table in §5a of 20260809103100_committee_term_expiry.sql, measured
// against production inside BEGIN..ROLLBACK as a real signed-in member.
// ---------------------------------------------------------------------------

const LIVE = (id: string) => ({ committeeId: id, termEnd: '2099-01-01' });
const EXPIRED = (id: string, on = '2020-06-30') => ({ committeeId: id, termEnd: on });
const OPEN_ENDED = (id: string) => ({ committeeId: id, termEnd: null });

describe('isSeatCurrent', () => {
  const today = '2026-08-05';

  it('counts the last day of the term as INSIDE the term', () => {
    // term_end is inclusive. The SQL says `>= current_date`, not `>`, and a
    // member turfed out on the morning of their final meeting is a bug.
    expect(isSeatCurrent({ committeeId: 'c', termEnd: today }, today)).toBe(true);
  });

  it('ends access the day after the term end date', () => {
    expect(isSeatCurrent({ committeeId: 'c', termEnd: '2026-08-04' }, today)).toBe(false);
  });

  it('keeps a future term open', () => {
    expect(isSeatCurrent({ committeeId: 'c', termEnd: '2027-03-31' }, today)).toBe(true);
  });

  it('🛑 treats a NULL term_end as STILL CURRENT — the permanent safety net', () => {
    // The trap this whole change is written around: before the 2026-08-05
    // backfill every roster row had a NULL term_end, and a naive
    // `term_end >= today` is false for NULL, which would have locked out every
    // member on the platform — silently, because RLS denial returns 0 rows
    // with no error. A seat with no end date must fail OPEN.
    expect(isSeatCurrent(OPEN_ENDED('c'), today)).toBe(true);
  });

  it('compares as plain date strings, so a year boundary is not an off-by-one', () => {
    expect(isSeatCurrent({ committeeId: 'c', termEnd: '2026-12-31' }, '2027-01-01')).toBe(false);
    expect(isSeatCurrent({ committeeId: 'c', termEnd: '2027-01-01' }, '2026-12-31')).toBe(true);
  });
});

describe('formatTermEnd', () => {
  it('renders a date a human would say out loud', () => {
    expect(formatTermEnd('2027-03-31')).toBe('31 March 2027');
    expect(formatTermEnd('2026-08-04')).toBe('4 August 2026');
  });

  it('never renders an empty or misleading date', () => {
    expect(formatTermEnd(null)).toBe('an unrecorded date');
    expect(formatTermEnd('not-a-date')).toBe('not-a-date');
  });
});

describe('decideCommitteeListAccess', () => {
  it('lets a permission holder in without needing a roster read', () => {
    const d = decideCommitteeListAccess({ hasViewPermission: true, seats: [] });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('permission');
  });

  it('lets an ordinary member in on one live seat alone', () => {
    const d = decideCommitteeListAccess({
      hasViewPermission: false,
      seats: [LIVE('ce403c74-85b9-452e-aaec-6757bab0f915')],
    });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('roster');
  });

  it('refuses in words, and names who to ask, when neither route applies', () => {
    const d = decideCommitteeListAccess({ hasViewPermission: false, seats: [] });
    expect(d.allowed).toBe(false);
    expect(d.title).toContain('do not have access');
    // The refusal has to say the roster is the way in — otherwise a member who
    // was appointed but never added has no idea what to ask for.
    expect(d.detail).toContain('roster');
    expect(d.contact).toBe(COMMITTEE_ACCESS_CONTACT);
    expect(d.contact.length).toBeGreaterThan(0);
  });

  it('never opens on an empty roster read — an empty list is a refusal, not a page', () => {
    // RLS denial returns 0 rows with no error, so "denied" and "nothing
    // exists" look identical. The gate resolves that tie by refusing, so the
    // viewer gets a sentence instead of a blank screen.
    expect(decideCommitteeListAccess({ hasViewPermission: false, seats: [] }).allowed).toBe(false);
  });

  it('an expired seat does NOT open the list', () => {
    const d = decideCommitteeListAccess({ hasViewPermission: false, seats: [EXPIRED('a')] });
    expect(d.allowed).toBe(false);
  });

  it('tells an expired member the DATE, not that they were never appointed', () => {
    const d = decideCommitteeListAccess({
      hasViewPermission: false,
      seats: [EXPIRED('a', '2026-03-31')],
    });
    expect(d.expired).toBe(true);
    expect(d.title).toContain('term');
    expect(d.detail).toContain('31 March 2026');
    // The lie this replaces: an expired member must NOT be told they are on no
    // roster, and must NOT be told to ask to be "added" — they were added.
    expect(d.detail).not.toContain('ask for your name to be added');
    expect(d.contact).toBe(COMMITTEE_TERM_RENEWAL_CONTACT);
    expect(d.contact).toContain('Chairman');
  });

  it('reassures an expired member that their contributions survive', () => {
    const d = decideCommitteeListAccess({ hasViewPermission: false, seats: [EXPIRED('a')] });
    expect(d.detail).toMatch(/still on the record/);
  });

  it('quotes the LONGEST-running seat when several have expired', () => {
    const d = decideCommitteeListAccess({
      hasViewPermission: false,
      seats: [EXPIRED('a', '2024-03-31'), EXPIRED('b', '2026-03-31')],
    });
    expect(d.detail).toContain('31 March 2026');
    expect(d.detail).not.toContain('2024');
  });

  it('one live seat beats any number of expired ones', () => {
    const d = decideCommitteeListAccess({
      hasViewPermission: false,
      seats: [EXPIRED('a'), EXPIRED('b'), LIVE('c')],
    });
    expect(d.allowed).toBe(true);
  });

  it('an open-ended seat still opens the list — fail open, never a silent lockout', () => {
    const d = decideCommitteeListAccess({ hasViewPermission: false, seats: [OPEN_ENDED('a')] });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('roster');
  });
});

describe('decideCommitteeDetailAccess', () => {
  const A = 'ce403c74-85b9-452e-aaec-6757bab0f915';
  const B = '19c00ca0-f3b2-4b4b-83e0-349b10e58122';

  it('opens the committee the viewer sits on', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [LIVE(A)],
      committeeId: A,
    });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('roster');
  });

  it('does NOT open a different committee — membership is per committee', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [LIVE(A)],
      committeeId: B,
    });
    expect(d.allowed).toBe(false);
  });

  it('tells a member of another committee exactly why this one is shut', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [LIVE(A)],
      committeeId: B,
    });
    expect(d.detail).toContain('another committee');
    expect(d.contact).toBe(COMMITTEE_ACCESS_CONTACT);
  });

  it('gives a viewer on no roster at all the plain version, not the confusing one', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [],
      committeeId: B,
    });
    expect(d.allowed).toBe(false);
    expect(d.detail).not.toContain('another committee');
    expect(d.detail).toContain('roster');
  });

  it('a permission holder opens any committee regardless of roster or term', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: true,
      seats: [EXPIRED(B)],
      committeeId: B,
    });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('permission');
  });

  it('closes the committee whose term has ended', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [EXPIRED(A, '2026-03-31')],
      committeeId: A,
    });
    expect(d.allowed).toBe(false);
    expect(d.expired).toBe(true);
    expect(d.detail).toContain('31 March 2026');
  });

  it('🛑 an expired seat is NEVER mistaken for "you were never on this committee"', () => {
    // This is the whole point of the own-seat arm added to members_select in
    // 20260809103100. If the expired member were simply invisible they would
    // land on the generic refusal — or, one line further down the page, on
    // notFound(), which tells them the committee does not exist. Both are
    // fabricated absence.
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [EXPIRED(A)],
      committeeId: A,
    });
    expect(d.detail).not.toContain('never');
    expect(d.detail).not.toContain('ask for your name to be added');
    expect(d.title).not.toContain('do not have access to this committee');
  });

  it('an expired seat HERE outranks a live seat elsewhere in the wording', () => {
    // Being told "you are on another committee" when the truth is "your term
    // here ended" sends the member to the wrong person with the wrong ask.
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [EXPIRED(A), LIVE(B)],
      committeeId: A,
    });
    expect(d.expired).toBe(true);
    expect(d.detail).not.toContain('another committee');
  });

  it('a viewer whose only OTHER seat has expired gets the plain refusal, not the confusing one', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [EXPIRED(A)],
      committeeId: B,
    });
    expect(d.allowed).toBe(false);
    expect(d.expired).toBeUndefined();
    expect(d.detail).not.toContain('another committee');
  });

  it('an open-ended seat still opens its committee', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      seats: [OPEN_ENDED(A)],
      committeeId: A,
    });
    expect(d.allowed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Migration hygiene. Not a proof that the policy works — a guard on the
// properties a reviewer would otherwise have to eyeball, each of which has its
// own recorded incident in this repo.
// ---------------------------------------------------------------------------
describe('20260809102300_committee_roster_access.sql', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260809102300_committee_roster_access.sql',
    ),
    'utf8',
  );

  it('locks the helper away from anon and keeps it callable by authenticated', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_user_is_committee_member\(uuid\) FROM anon, PUBLIC;/,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_user_is_committee_member\(uuid\) TO authenticated;/,
    );
  });

  it('declares the helper SECURITY DEFINER with a pinned search_path', () => {
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  it('never matches an external member, and never a NULL identity', () => {
    expect(sql).toContain('m.is_external  = false');
    expect(sql).toContain('m.user_id      IS NOT NULL');
    expect(sql).toContain('m.user_id      = auth.uid()');
    expect(sql).not.toMatch(/fn_user_is_committee_member\(\s*p_user_id/);
  });

  it('adds the roster arm to all four SELECT policies and to no write policy', () => {
    const rosterArm = /fn_user_is_committee_member\(/g;
    for (const policy of [
      'committees_select',
      'members_select',
      'acm_select',
      'acr_select',
    ]) {
      const line = sql
        .split('\n')
        .find((l) => l.startsWith(`ALTER POLICY "${policy}"`));
      expect(line, `${policy} must be rewritten`).toBeTruthy();
      expect(line).toMatch(rosterArm);
    }
    const altered = sql
      .split('\n')
      .filter((l) => l.startsWith('ALTER POLICY'))
      .map((l) => l.split('"')[1]);
    expect(altered.sort()).toEqual([
      'acm_select',
      'acr_select',
      'committees_select',
      'members_select',
    ]);
  });

  it('uses the grantable naac permission family, not the ungrantable one', () => {
    expect(sql).toContain("user_has_permission('accreditation.naac.committees.view'");
    const altersOnly = sql
      .split('\n')
      .filter((l) => l.startsWith('ALTER POLICY'))
      .join('\n');
    expect(altersOnly).not.toMatch(/'accreditation\.committees\./);
  });
});

describe('20260809103100_committee_term_expiry.sql', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260809103100_committee_term_expiry.sql',
    ),
    'utf8',
  );

  it('🛑 keeps the NULL safety net in the predicate', () => {
    // The single line that decides whether applying this file locks out every
    // committee member on the platform or none of them.
    expect(sql).toContain('AND (m.term_end IS NULL OR m.term_end >= current_date)');
    // A bare `term_end >= current_date` — NULL-blind — must never appear.
    expect(sql).not.toMatch(/AND\s+m\.term_end\s+>=\s+current_date\s*\n/);
  });

  it('warns the next reader not to delete the safety net', () => {
    // Comments are the only thing standing between this arm and a future
    // "tidy-up" that reintroduces the lockout.
    expect(sql).toMatch(/DO NOT "TIDY AWAY" THE `IS NULL` ARM/);
  });

  it('treats the last day of the term as inside it', () => {
    expect(sql).toContain('m.term_end >= current_date');
    expect(sql).not.toContain('m.term_end > current_date');
  });

  it('re-asserts the anon revoke, because CREATE OR REPLACE is a fresh grant surface', () => {
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_user_is_committee_member\(uuid\) FROM anon, PUBLIC;/,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_user_is_committee_member\(uuid\) TO authenticated;/,
    );
  });

  it('keeps SECURITY DEFINER and the pinned search_path', () => {
    // Losing SECURITY DEFINER makes members_select recurse into the table the
    // helper reads. That is a hang, not a style regression.
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  it('refuses to apply rather than silently skipping rows it cannot satisfy', () => {
    expect(sql).toContain('REFUSING TO APPLY');
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });

  it('gives term_end a DEFAULT before making it NOT NULL', () => {
    // Without the default, the live SECURITY DEFINER fn_set_college_leadership
    // — whose INSERT names no term_end column — raises 23502 at the first
    // click. Order matters: the default has to exist before the constraint.
    const defaultAt = sql.indexOf('ALTER COLUMN term_end SET DEFAULT');
    const notNullAt = sql.indexOf('ALTER COLUMN term_end SET NOT NULL');
    expect(defaultAt).toBeGreaterThan(-1);
    expect(notNullAt).toBeGreaterThan(-1);
    expect(defaultAt).toBeLessThan(notNullAt);
    expect(sql).toContain('fn_set_college_leadership');
  });

  it('touches no write policy — this file ends access, it does not grant any', () => {
    const altered = sql
      .split('\n')
      .filter((l) => l.startsWith('ALTER POLICY'))
      .map((l) => l.split('"')[1]);
    expect(altered).toEqual(['members_select']);
  });
});
