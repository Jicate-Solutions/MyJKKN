import { describe, it, expect } from 'vitest';
import { findUmbrellaRow } from '@/app/(routes)/accreditation/naac/committees/_lib/umbrella-row';

// ---------------------------------------------------------------------------
// A cluster council is FILED under an umbrella institution (its RLS scopes by
// institution_id, so the column cannot be null). That row used to be found by
// an exact `name === 'JKKN Main Office'` match, which fails silently the moment
// anyone edits the name — the field just stays empty with no error.
//
// These cases are the realistic ways that string drifts. Shape mirrors the live
// institutions table (14 rows; exactly 8 carry an iqac_code).
// ---------------------------------------------------------------------------
const row = (name: string, iqac_code: string | null = null) => ({
  id: `id-${name}`,
  name,
  iqac_code,
  institution_type: 'self',
});

const COLLEGES = [
  row('JKKN College of Pharmacy', 'PHAR'),
  row('JKKN College of Engineering and Technology', 'ENGG'),
];

describe('findUmbrellaRow', () => {
  it('finds the row by its exact live name', () => {
    const list = [...COLLEGES, row('JKKN Main Office')];
    expect(findUmbrellaRow(list)?.name).toBe('JKKN Main Office');
  });

  it('survives surrounding whitespace', () => {
    const list = [...COLLEGES, row('  JKKN Main Office  ')];
    expect(findUmbrellaRow(list)).toBeDefined();
  });

  it('survives a case change', () => {
    const list = [...COLLEGES, row('JKKN MAIN OFFICE')];
    expect(findUmbrellaRow(list)).toBeDefined();
  });

  it('survives a doubled internal space', () => {
    const list = [...COLLEGES, row('JKKN  Main  Office')];
    expect(findUmbrellaRow(list)).toBeDefined();
  });

  it('still finds it after a rename that keeps "main office"', () => {
    const list = [...COLLEGES, row('JKKN Group Main Office (Admin)')];
    expect(findUmbrellaRow(list)?.name).toBe('JKKN Group Main Office (Admin)');
  });

  it('prefers a non-college row when several could match', () => {
    // An accredited college is never the umbrella, even if it were named oddly.
    const list = [
      row('JKKN College Main Office Annexe', 'ANNX'),
      row('JKKN Main Office'),
    ];
    expect(findUmbrellaRow(list)?.iqac_code).toBeNull();
  });

  it('returns undefined rather than guessing when nothing matches', () => {
    // The picker then stays on its placeholder listing every institution, so the
    // Director chooses by hand — visible, not silent.
    expect(findUmbrellaRow(COLLEGES)).toBeUndefined();
  });

  it('handles an empty list', () => {
    expect(findUmbrellaRow([])).toBeUndefined();
  });
});
