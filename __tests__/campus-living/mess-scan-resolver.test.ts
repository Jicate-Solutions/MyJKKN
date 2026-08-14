import { describe, it, expect } from 'vitest';
import {
  classifyScannedCode,
  resolveScannedCode,
  type MessScanLookup,
  type ScannedLearner,
} from '@/lib/services/campus-living/mess-scan-resolver';

/**
 * These tests drive the shipped resolver directly, with its database port
 * faked. They deliberately do NOT restate its branching in the fixture — the
 * fake below is a dumb table of rows, so a test passes only because the real
 * decision logic picked the right lookup, not because the test agreed with
 * itself.
 *
 * The fixture mirrors the live shapes:
 *   learners_profiles.id  — what today's printed card QR encodes
 *   jkkn_identities       — what the sibling lane is moving the card QR to
 *   profiles.learner_id   — the 1:1 bridge to the id mess_meal_records wants
 */

const LEARNER_PROFILE_ID = '9f8a1c2d-3e4b-4a5c-8d7e-6f0a1b2c3d4e';
const PROFILE_ID = '11112222-3333-4444-5555-666677778888';
const INSTITUTION_ID = 'aaaabbbb-cccc-dddd-eeee-ffff00001111';

// A learner with no login profile — roughly one card in six lands here
// (1,190 of 7,235 learners_profiles rows have no profiles row).
const ORPHAN_LEARNER_PROFILE_ID = '00000000-1111-2222-3333-444444444444';

// An employee card encodes profiles.id directly (render-data.ts:755).
const EMPLOYEE_PROFILE_ID = 'deadbeef-0000-1111-2222-333344445555';

const LEARNERS: Record<string, ScannedLearner> = {
  [LEARNER_PROFILE_ID]: {
    id: LEARNER_PROFILE_ID,
    institutionId: INSTITUTION_ID,
    fullName: 'Meena Rajan',
    rollNumber: '22BCA045',
  },
  [ORPHAN_LEARNER_PROFILE_ID]: {
    id: ORPHAN_LEARNER_PROFILE_ID,
    institutionId: INSTITUTION_ID,
    fullName: 'Arun Kumar',
    rollNumber: '23BSC112',
  },
};

/** jkkn_identities: jkkn_id -> learner_profile_id, retired rows excluded. */
const ACTIVE_JKKN_IDS: Record<string, string> = { '348295-7': LEARNER_PROFILE_ID };
const RETIRED_JKKN_ID = '111111-8';

const ROLL_NUMBERS: Record<string, string> = { '22BCA045': LEARNER_PROFILE_ID };

/** profiles.learner_id -> profiles.id. The orphan is absent on purpose. */
const PROFILE_BY_LEARNER: Record<string, string> = { [LEARNER_PROFILE_ID]: PROFILE_ID };

const PROFILES_BY_ID: Record<
  string,
  { id: string; institutionId: string | null; fullName: string }
> = {
  [EMPLOYEE_PROFILE_ID]: {
    id: EMPLOYEE_PROFILE_ID,
    institutionId: INSTITUTION_ID,
    fullName: 'Dr S Balaji',
  },
};

function lookup(): MessScanLookup {
  return {
    async learnerByLearnerProfileId(id) {
      return LEARNERS[id] ?? null;
    },
    async learnerByRollNumber(roll) {
      const id = ROLL_NUMBERS[roll];
      return id ? LEARNERS[id] : null;
    },
    async learnerProfileIdByJkknId(jkknId) {
      // A retired number is simply absent from the active set.
      return ACTIVE_JKKN_IDS[jkknId] ?? null;
    },
    async profileIdForLearner(learnerProfileId) {
      return PROFILE_BY_LEARNER[learnerProfileId] ?? null;
    },
    async profileById(id) {
      return PROFILES_BY_ID[id] ?? null;
    },
  };
}

describe('classifyScannedCode — the two card generations must both be readable', () => {
  it('reads a raw uuid, which is what the card prints today', () => {
    expect(classifyScannedCode(LEARNER_PROFILE_ID)).toEqual({
      code: LEARNER_PROFILE_ID,
      shape: 'uuid',
    });
  });

  it('reads a permanent JKKN ID, which is what the card is moving to', () => {
    expect(classifyScannedCode('348295-7')).toEqual({ code: '348295-7', shape: 'jkkn_id' });
  });

  it('strips the trailing newline a scanner wedge appends', () => {
    expect(classifyScannedCode(`${LEARNER_PROFILE_ID}\r\n`).shape).toBe('uuid');
    expect(classifyScannedCode('  348295-7  ').code).toBe('348295-7');
  });

  it('restores the dash on a hand-typed JKKN ID', () => {
    expect(classifyScannedCode('3482957')).toEqual({ code: '348295-7', shape: 'jkkn_id' });
  });

  it('treats a roll number as free text, not as a uuid', () => {
    // Passing this through as learner_id is what raised a bare Postgres 22P02.
    expect(classifyScannedCode('22BCA045').shape).toBe('other');
  });

  it('does not mistake a 7-digit register number fragment for a uuid', () => {
    expect(classifyScannedCode('not-a-uuid-at-all').shape).toBe('other');
  });
});

describe('resolveScannedCode — a printed card resolves to the id a meal record accepts', () => {
  it("today's card (learners_profiles.id) bridges to profiles.id", async () => {
    const r = await resolveScannedCode(LEARNER_PROFILE_ID, lookup());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    // The whole point: the id written to mess_meal_records.learner_id is the
    // profiles.id, never the learners_profiles.id printed on the card.
    expect(r.profileId).toBe(PROFILE_ID);
    expect(r.profileId).not.toBe(LEARNER_PROFILE_ID);
    expect(r.displayName).toBe('Meena Rajan');
    expect(r.rollNumber).toBe('22BCA045');
    expect(r.matchedBy).toBe('learner_profile_id');
  });

  it("tomorrow's card (permanent JKKN ID) resolves to the same profiles.id", async () => {
    const r = await resolveScannedCode('348295-7', lookup());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.profileId).toBe(PROFILE_ID);
    expect(r.matchedBy).toBe('jkkn_id');
  });

  it('takes institution from the LEARNER, so a guard never mis-files a cross-college scan', async () => {
    const r = await resolveScannedCode(LEARNER_PROFILE_ID, lookup());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.institutionId).toBe(INSTITUTION_ID);
  });

  it('an employee card, which encodes profiles.id directly, needs no bridge', async () => {
    const r = await resolveScannedCode(EMPLOYEE_PROFILE_ID, lookup());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.profileId).toBe(EMPLOYEE_PROFILE_ID);
    expect(r.matchedBy).toBe('profile_id');
  });

  it('the manual box works for the roll number its own label asks for', async () => {
    const r = await resolveScannedCode('22BCA045', lookup());
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.profileId).toBe(PROFILE_ID);
    expect(r.matchedBy).toBe('roll_number');
  });
});

describe('resolveScannedCode — an unreadable card is an answer, never a crash or a silent no-op', () => {
  it('an unknown uuid is not recognised', async () => {
    const r = await resolveScannedCode('12345678-1234-1234-1234-123456789abc', lookup());
    expect(r.status).toBe('not_recognised');
  });

  it('a RETIRED JKKN ID is not recognised', async () => {
    const r = await resolveScannedCode(RETIRED_JKKN_ID, lookup());
    expect(r.status).toBe('not_recognised');
  });

  it('an unknown roll number is not recognised', async () => {
    const r = await resolveScannedCode('99ZZZ999', lookup());
    expect(r.status).toBe('not_recognised');
  });

  it('an empty scan is not recognised rather than resolving to anything', async () => {
    for (const empty of ['', '   ', null, undefined]) {
      const r = await resolveScannedCode(empty, lookup());
      expect(r.status).toBe('not_recognised');
    }
  });

  it('a real learner with no login profile reads as its own distinct state', async () => {
    // ~16% of printed cards land here. Reporting them as "not recognised"
    // would make a data gap look like broken hardware to the guard.
    const r = await resolveScannedCode(ORPHAN_LEARNER_PROFILE_ID, lookup());
    expect(r.status).toBe('no_login_profile');
    if (r.status !== 'no_login_profile') return;
    expect(r.displayName).toBe('Arun Kumar');
  });

  it('never throws for any unresolvable input', async () => {
    const inputs = ['', 'garbage', '000000-0', 'DROP TABLE', '348295-7 ', null];
    for (const input of inputs) {
      await expect(resolveScannedCode(input, lookup())).resolves.toBeDefined();
    }
  });
});
