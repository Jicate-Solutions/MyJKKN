// __tests__/lib/id-cards/qr-jkkn-id.test.ts
//
// The card QR carries the permanent JKKN ID, with the internal UUID as the
// fallback. The risk this file exists to close is a BLANK QR: the JKKN ID
// register is filled in by a backfill, so for a while some people hold a
// number and some do not, and every card in both groups must still scan.
//
// The fake Supabase client below applies `.eq()` / `.is()` filters to its own
// row set for real. That matters for the retired-identity case: the retired
// row is excluded because the production code asked for `retired_at IS NULL`
// and the fake honoured it — not because the test hard-coded the outcome. The
// recorded-filter assertion is the second half of that proof.

import { describe, it, expect } from 'vitest';
import { assembleCardData, pickQrValue, makeQrDataUrl } from '@/lib/id-cards/render-data';

// ─────────────────────────────────────────────────────────────────────────────
// A fake PostgREST builder that really filters
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type RecordedFilter = { table: string; op: 'eq' | 'is'; column: string; value: unknown };

/** Errors to inject per table, so the fail-soft paths can be exercised. */
type Failures = Partial<Record<string, string>>;

function makeSupabase(tables: Tables, failures: Failures = {}) {
  const filters: RecordedFilter[] = [];

  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const failure = failures[table];
    const result = () =>
      failure ? { data: null, error: { message: failure } } : { data: rows, error: null };

    const api = {
      // The select list is ignored on purpose: fixtures carry the embedded
      // shapes (program/department/batch) directly.
      select: () => api,
      eq(column: string, value: unknown) {
        filters.push({ table, op: 'eq', column, value });
        rows = rows.filter((r) => r[column] === value);
        return api;
      },
      is(column: string, value: unknown) {
        filters.push({ table, op: 'is', column, value });
        rows = rows.filter((r) => (r[column] ?? null) === value);
        return api;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return api;
      },
      maybeSingle: async () =>
        failure
          ? { data: null, error: { message: failure } }
          : { data: rows[0] ?? null, error: null },
      // Builders are thenables, so `await supabase.from(...).select(...)` works.
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return api;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: { from: (table: string) => builder(table) } as any, filters };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const LEARNER_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const INSTITUTION_ID = '44444444-4444-4444-8444-444444444444';

// Both carry a real Damm check digit, so a fixture can be pasted into
// fn_jkkn_id_validate and come back true. 348295-7 is the migration's own
// canonical example.
const JKKN_ID = '348295-7';
const OTHER_JKKN_ID = '512044-7';

const learnerProfile: Row = {
  id: PROFILE_ID,
  full_name: 'Anitha Kumari',
  email: 'anitha@jkkn.ac.in',
  avatar_url: null,
  institution_id: INSTITUTION_ID,
  learner_id: LEARNER_ID
};

const teamMemberProfile: Row = {
  id: PROFILE_ID,
  full_name: 'Meena Devi',
  email: 'meena@jkkn.ac.in',
  avatar_url: null,
  institution_id: INSTITUTION_ID,
  learner_id: null
};

const learnerRow: Row = {
  id: LEARNER_ID,
  first_name: 'Anitha',
  last_name: 'Kumari',
  roll_number: '21AI042',
  register_number: 'REG-9921',
  student_photo_url: null,
  blood_group: 'B+',
  date_of_birth: '2001-11-09',
  father_name: 'R. Kumar',
  father_mobile: '9876543210',
  mother_name: null,
  mother_mobile: null,
  student_mobile: '9123456780',
  permanent_address_street: '12 Main Street',
  permanent_address_taluk: null,
  permanent_address_district: null,
  permanent_address_state: null,
  permanent_address_pin_code: null,
  program: { program_name: 'B.Tech AI', card_short_name: 'BTECH AI' },
  department: { department_name: 'CSE' },
  batch: null
};

const staffRow: Row = {
  id: STAFF_ID,
  institution_email: 'meena@jkkn.ac.in',
  email: 'meena@jkkn.ac.in',
  first_name: 'Meena',
  last_name: 'Devi',
  designation: 'Associate Professor',
  profile_picture: null,
  staff_id: 'JK00417',
  blood_group: 'B+',
  date_of_birth: '1985-04-02',
  address: 'Komarapalayam',
  phone: '9123456780',
  department: { department_name: 'Pharmacology' }
};

const institutionRow: Row = { id: INSTITUTION_ID, name: 'JKKN College of Engineering' };

/** Injected read failure, hoisted so the table-keyed maps below stay literal-free. */
const TIMEOUT = 'timeout';

function identity(overrides: Row): Row {
  return {
    jkkn_id: JKKN_ID,
    learner_profile_id: null,
    team_member_id: null,
    retired_at: null,
    ...overrides
  };
}

async function assemble(tables: Tables, failures: Failures = {}) {
  const { client, filters } = makeSupabase(tables, failures);
  const out = await assembleCardData(client, PROFILE_ID, null);
  if (!out.ok) throw new Error(`assembleCardData failed: ${out.code}`);
  return { data: out.data, filters };
}

// ─────────────────────────────────────────────────────────────────────────────
// pickQrValue — the pure chooser
// ─────────────────────────────────────────────────────────────────────────────

describe('pickQrValue', () => {
  it('prefers the permanent JKKN ID over the internal UUID', () => {
    expect(pickQrValue(JKKN_ID, LEARNER_ID)).toBe(JKKN_ID);
  });

  it('falls back to the UUID when no number has been issued', () => {
    expect(pickQrValue(null, LEARNER_ID)).toBe(LEARNER_ID);
    expect(pickQrValue(undefined, LEARNER_ID)).toBe(LEARNER_ID);
  });

  it('treats a blank or padded jkkn_id as "not issued" (char(8) can pad)', () => {
    expect(pickQrValue('', LEARNER_ID)).toBe(LEARNER_ID);
    expect(pickQrValue('        ', LEARNER_ID)).toBe(LEARNER_ID);
  });

  it('trims the stored value to its canonical written form', () => {
    expect(pickQrValue(` ${JKKN_ID} `, LEARNER_ID)).toBe(JKKN_ID);
  });

  it('never invents a payload when both inputs are empty', () => {
    expect(pickQrValue(null, null)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Learners
// ─────────────────────────────────────────────────────────────────────────────

describe('assembleCardData — learner QR payload', () => {
  it('a learner WITH a JKKN ID gets it in the QR', async () => {
    const { data } = await assemble({
      profiles: [learnerProfile],
      learners_profiles: [learnerRow],
      institutions: [institutionRow],
      jkkn_identities: [identity({ learner_profile_id: LEARNER_ID })]
    });
    expect(data.qrValue).toBe(JKKN_ID);
  });

  it('a learner WITHOUT a JKKN ID still gets a working QR (the UUID)', async () => {
    const { data } = await assemble({
      profiles: [learnerProfile],
      learners_profiles: [learnerRow],
      institutions: [institutionRow],
      jkkn_identities: []
    });
    expect(data.qrValue).toBe(LEARNER_ID);
    expect(data.qrValue.trim()).not.toBe('');
  });

  it('a RETIRED identity is not used — the card falls back to the UUID', async () => {
    const { data, filters } = await assemble({
      profiles: [learnerProfile],
      learners_profiles: [learnerRow],
      institutions: [institutionRow],
      jkkn_identities: [
        identity({
          learner_profile_id: LEARNER_ID,
          retired_at: '2026-08-01T00:00:00Z'
        })
      ]
    });
    expect(data.qrValue).toBe(LEARNER_ID);
    expect(data.qrValue).not.toBe(JKKN_ID);
    // Second half of the proof: the exclusion came from the query the
    // production code issued, not from the fixture happening not to match.
    expect(filters).toContainEqual({
      table: 'jkkn_identities',
      op: 'is',
      column: 'retired_at',
      value: null
    });
  });

  it('prefers the ACTIVE number when the person also holds a retired one', async () => {
    const { data } = await assemble({
      profiles: [learnerProfile],
      learners_profiles: [learnerRow],
      institutions: [institutionRow],
      jkkn_identities: [
        identity({
          learner_profile_id: LEARNER_ID,
          jkkn_id: OTHER_JKKN_ID,
          retired_at: '2026-08-01T00:00:00Z'
        }),
        identity({ learner_profile_id: LEARNER_ID })
      ]
    });
    expect(data.qrValue).toBe(JKKN_ID);
  });

  it('keys the lookup on learners_profiles.id, not the profile id', async () => {
    const { data } = await assemble({
      profiles: [learnerProfile],
      learners_profiles: [learnerRow],
      institutions: [institutionRow],
      // Decoy: a number filed against the PROFILE id must not be picked up.
      jkkn_identities: [identity({ learner_profile_id: PROFILE_ID, jkkn_id: OTHER_JKKN_ID })]
    });
    expect(data.qrValue).toBe(LEARNER_ID);
  });

  it('still finds the JKKN ID when the learner read degrades', async () => {
    const { data } = await assemble(
      {
        profiles: [learnerProfile],
        learners_profiles: [learnerRow],
        institutions: [institutionRow],
        jkkn_identities: [identity({ learner_profile_id: LEARNER_ID })]
      },
      { learners_profiles: 'connection reset' }
    );
    expect(data.qrValue).toBe(JKKN_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Team members
// ─────────────────────────────────────────────────────────────────────────────

describe('assembleCardData — team-member QR payload', () => {
  it('a team member WITH a JKKN ID gets it in the QR', async () => {
    const { data } = await assemble({
      profiles: [teamMemberProfile],
      staff: [staffRow],
      institutions: [institutionRow],
      jkkn_identities: [identity({ team_member_id: STAFF_ID })]
    });
    expect(data.kind).toBe('employee');
    expect(data.qrValue).toBe(JKKN_ID);
  });

  it('a team member WITHOUT a JKKN ID still gets a working QR (the UUID)', async () => {
    const { data } = await assemble({
      profiles: [teamMemberProfile],
      staff: [staffRow],
      institutions: [institutionRow],
      jkkn_identities: []
    });
    expect(data.qrValue).toBe(PROFILE_ID);
    expect(data.qrValue.trim()).not.toBe('');
  });

  it('keys the lookup on the team-member record id, not the profile id', async () => {
    const { data } = await assemble({
      profiles: [teamMemberProfile],
      staff: [staffRow],
      institutions: [institutionRow],
      // jkkn_identities keys team members on staff.id. A number filed against
      // the profile id belongs to a different identity space entirely.
      jkkn_identities: [identity({ team_member_id: PROFILE_ID, jkkn_id: OTHER_JKKN_ID })]
    });
    expect(data.qrValue).toBe(PROFILE_ID);
    expect(data.qrValue).not.toBe(OTHER_JKKN_ID);
  });

  it('a RETIRED team-member identity is not used', async () => {
    const { data } = await assemble({
      profiles: [teamMemberProfile],
      staff: [staffRow],
      institutions: [institutionRow],
      jkkn_identities: [
        identity({ team_member_id: STAFF_ID, retired_at: '2026-08-01T00:00:00Z' })
      ]
    });
    expect(data.qrValue).toBe(PROFILE_ID);
  });

  it('falls back to the UUID when no team-member record matches the profile', async () => {
    const { data } = await assemble({
      profiles: [teamMemberProfile],
      staff: [],
      institutions: [institutionRow],
      jkkn_identities: [identity({ team_member_id: STAFF_ID })]
    });
    expect(data.qrValue).toBe(PROFILE_ID);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The blank-QR guard — the whole risk of this change
// ─────────────────────────────────────────────────────────────────────────────

describe('no card is ever printed with a blank QR', () => {
  const cases: { name: string; tables: Tables; failures?: Failures }[] = [
    {
      name: 'learner, number issued',
      tables: {
        profiles: [learnerProfile],
        learners_profiles: [learnerRow],
        institutions: [institutionRow],
        jkkn_identities: [identity({ learner_profile_id: LEARNER_ID })]
      }
    },
    {
      name: 'learner, backfill has not reached them',
      tables: {
        profiles: [learnerProfile],
        learners_profiles: [learnerRow],
        institutions: [institutionRow],
        jkkn_identities: []
      }
    },
    {
      name: 'learner, identity retired',
      tables: {
        profiles: [learnerProfile],
        learners_profiles: [learnerRow],
        institutions: [institutionRow],
        jkkn_identities: [
          identity({ learner_profile_id: LEARNER_ID, retired_at: '2026-08-01T00:00:00Z' })
        ]
      }
    },
    {
      name: 'learner, jkkn_identities read fails',
      tables: {
        profiles: [learnerProfile],
        learners_profiles: [learnerRow],
        institutions: [institutionRow],
        jkkn_identities: [identity({ learner_profile_id: LEARNER_ID })]
      },
      failures: { jkkn_identities: 'permission denied for table jkkn_identities' }
    },
    {
      name: 'learner, stored number is blank padding',
      tables: {
        profiles: [learnerProfile],
        learners_profiles: [learnerRow],
        institutions: [institutionRow],
        jkkn_identities: [identity({ learner_profile_id: LEARNER_ID, jkkn_id: '        ' })]
      }
    },
    {
      name: 'learner, both reads degrade',
      tables: {
        profiles: [learnerProfile],
        learners_profiles: [learnerRow],
        institutions: [institutionRow],
        jkkn_identities: []
      },
      failures: { learners_profiles: TIMEOUT, jkkn_identities: TIMEOUT }
    },
    {
      name: 'team member, number issued',
      tables: {
        profiles: [teamMemberProfile],
        staff: [staffRow],
        institutions: [institutionRow],
        jkkn_identities: [identity({ team_member_id: STAFF_ID })]
      }
    },
    {
      name: 'team member, backfill has not reached them',
      tables: {
        profiles: [teamMemberProfile],
        staff: [staffRow],
        institutions: [institutionRow],
        jkkn_identities: []
      }
    },
    {
      name: 'team member, no matching record and read fails',
      tables: {
        profiles: [teamMemberProfile],
        staff: [],
        institutions: [institutionRow],
        jkkn_identities: []
      },
      // `staff` here is the DB table identifier (terminology-exempt).
      failures: { staff: TIMEOUT, jkkn_identities: TIMEOUT }
    }
  ];

  it.each(cases)('$name → a non-empty payload that renders a QR', async ({ tables, failures }) => {
    const { data } = await assemble(tables, failures);
    expect(data.qrValue).toBeTruthy();
    expect(data.qrValue.trim()).not.toBe('');

    // Prove it is a WORKING QR, not merely a non-empty string: this is the
    // exact call the render route makes.
    const dataUrl = await makeQrDataUrl(data.qrValue);
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
