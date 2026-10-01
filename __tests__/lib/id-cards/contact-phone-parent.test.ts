// The back-side CONTACT row on a learner card is the PARENT's number
// (in-charge decision 2026-09-26): father_mobile → mother_mobile, and the
// learner's own student_mobile only when both parents are blank. Team members
// keep staff.phone. Same in-memory PostgREST fake as qr-jkkn-id.test.ts.

import { describe, expect, it } from 'vitest';
import { assembleCardData, isAssembleFailure } from '@/lib/id-cards/render-data';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

function makeSupabase(tables: Tables) {
  function builder(table: string) {
    let rows = [...(tables[table] ?? [])];
    const api = {
      select: () => api,
      eq(column: string, value: unknown) {
        rows = rows.filter((r) => r[column] === value);
        return api;
      },
      is(column: string, value: unknown) {
        rows = rows.filter((r) => (r[column] ?? null) === value);
        return api;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return api;
      },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve)
    };
    return api;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => builder(table) } as any;
}

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const LEARNER_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = '33333333-3333-4333-8333-333333333333';
const INSTITUTION_ID = '44444444-4444-4444-8444-444444444444';

const learnerProfile: Row = {
  id: PROFILE_ID,
  full_name: 'Anitha Kumari',
  email: 'anitha@jkkn.ac.in',
  avatar_url: null,
  institution_id: INSTITUTION_ID,
  learner_id: LEARNER_ID
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
  mother_name: 'S. Lakshmi',
  permanent_address_street: '12 Main Street',
  permanent_address_taluk: null,
  permanent_address_district: null,
  permanent_address_state: null,
  permanent_address_pin_code: null,
  program: { program_name: 'B.Tech AI', card_short_name: 'BTECH AI' },
  department: { department_name: 'CSE' },
  batch: null
};

const institutionRow: Row = { id: INSTITUTION_ID, name: 'JKKN College of Engineering' };

async function learnerContact(mobiles: {
  father_mobile: string | null;
  mother_mobile: string | null;
  student_mobile: string | null;
}) {
  const client = makeSupabase({
    profiles: [learnerProfile],
    learners_profiles: [{ ...learnerRow, ...mobiles }],
    institutions: [institutionRow],
    jkkn_identities: []
  });
  const out = await assembleCardData(client, PROFILE_ID, null);
  if (isAssembleFailure(out)) throw new Error(`assembleCardData failed: ${out.message}`);
  return out.data;
}

describe('learner CONTACT row prefers the parent', () => {
  it('prints the father mobile when present (trimmed)', async () => {
    const data = await learnerContact({
      father_mobile: ' 9876543210 ',
      mother_mobile: '9000000000',
      student_mobile: '9123456780'
    });
    expect(data.contactPhone).toBe('9876543210');
  });

  it('falls to the mother mobile when the father has none', async () => {
    const data = await learnerContact({
      father_mobile: null,
      mother_mobile: '9000000000',
      student_mobile: '9123456780'
    });
    expect(data.contactPhone).toBe('9000000000');
  });

  it('uses the learner own mobile only when both parents are blank', async () => {
    const data = await learnerContact({
      father_mobile: '',
      mother_mobile: null,
      student_mobile: '9123456780'
    });
    expect(data.contactPhone).toBe('9123456780');
  });

  it('stays null when nobody has a number — the row is omitted, never invented', async () => {
    const data = await learnerContact({ father_mobile: null, mother_mobile: null, student_mobile: null });
    expect(data.contactPhone).toBeNull();
  });

  it('keeps every raw mobile in the value bag for custom templates', async () => {
    const data = await learnerContact({
      father_mobile: '9876543210',
      mother_mobile: '9000000000',
      student_mobile: '9123456780'
    });
    expect(data.valueBag['learners_profiles.father_mobile']).toBe('9876543210');
    expect(data.valueBag['learners_profiles.mother_mobile']).toBe('9000000000');
    expect(data.valueBag['learners_profiles.student_mobile']).toBe('9123456780');
  });
});

describe('team-member CONTACT row is unchanged', () => {
  it('still prints staff.phone', async () => {
    const client = makeSupabase({
      profiles: [
        {
          id: PROFILE_ID,
          full_name: 'Meena Devi',
          email: 'meena@jkkn.ac.in',
          avatar_url: null,
          institution_id: INSTITUTION_ID,
          learner_id: null
        }
      ],
      staff: [
        {
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
        }
      ],
      institutions: [institutionRow],
      jkkn_identities: []
    });
    const out = await assembleCardData(client, PROFILE_ID, null);
    if (isAssembleFailure(out)) throw new Error(`assembleCardData failed: ${out.message}`);
    expect(out.data.contactPhone).toBe('9123456780');
  });
});
