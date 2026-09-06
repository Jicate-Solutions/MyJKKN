// __tests__/lib/id-cards/batch-program-labels.test.ts
// 2026-08-14 — the batch-print programme picker must distinguish twin rows.
//
// JKKN College of Engineering carries five pairs of programmes whose
// program_name is byte-identical: the degree programme and the first-year
// Science & Humanities teaching row that shares its name. The picker used to
// render program_name alone, so both twins looked the same and cards got
// printed against the row with zero active learners.
//
// The fixtures below are the LIVE production rows (read 2026-08-14).

import { describe, it, expect, vi } from 'vitest';

// The component's import chain reaches createClientSupabaseClient at module
// init (hooks → role-service), which throws without Supabase env vars. Only the
// pure helper is under test — stub the client.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}) as never
}));

import { buildProgramLabels } from '@/components/admin/id-cards/id-card-batch-print';

type Row = Parameters<typeof buildProgramLabels>[0][number];

const row = (
  id: string,
  program_name: string,
  program_id: string,
  department_name: string | null
): Row =>
  ({
    id,
    program_name,
    program_id,
    department: department_name === null ? null : { department_name }
  }) as Row;

/** The five live Engineering twin pairs (degree row + its -SH teaching row). */
const ENGINEERING_TWINS: Row[] = [
  row('cse', 'B.E. Computer Science and Engineering', 'CSE', 'Computer Science and Engineering'),
  row('cse-sh', 'B.E. Computer Science and Engineering', 'CSE-SH', 'Science and Humanities'),
  row('eee', 'B.E. Electrical and Electronics Engineering', 'EEE', 'Electrical and Electronics Engineering'),
  row('eee-sh', 'B.E. Electrical and Electronics Engineering', 'EEE-SH', 'Science and Humanities'),
  row('ece', 'B.E. Electronics and Communication Engineering', 'ECE', 'Electronics and Communication Engineering'),
  row('ece-sh', 'B.E. Electronics and Communication Engineering', 'ECE-SH', 'Science and Humanities'),
  row('mech', 'B.E. Mechanical Engineering', 'MECH', 'Mechanical Engineering'),
  row('mech-sh', 'B.E. Mechanical Engineering', 'MECH-SH', 'Science and Humanities'),
  row('it', 'B.Tech. Information Technology', 'IT', 'Information Technology'),
  row('it-sh', 'B.Tech. Information Technology', 'IT-SH', 'Science and Humanities')
];

describe('buildProgramLabels — negative control', () => {
  // If this test can pass while the picker still renders `p.program_name`
  // alone, it proves nothing. It cannot: it asserts the labels DIFFER.
  it('the old label (program_name alone) is ambiguous for every twin pair', () => {
    const collisions = new Map<string, number>();
    for (const p of ENGINEERING_TWINS) {
      collisions.set(p.program_name, (collisions.get(p.program_name) ?? 0) + 1);
    }
    // Five names, each used twice — the defect this fix exists to remove.
    expect([...collisions.values()].filter((n) => n > 1)).toHaveLength(5);
  });

  it('gives the two rows of every twin pair DIFFERENT labels', () => {
    const labels = buildProgramLabels(ENGINEERING_TWINS);
    for (const suffix of ['cse', 'eee', 'ece', 'mech', 'it']) {
      expect(labels.get(suffix)).not.toBe(labels.get(`${suffix}-sh`));
    }
    // …and every label in the picker is unique overall.
    const rendered = [...labels.values()];
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  it('names the department so a human can tell which twin is which', () => {
    const labels = buildProgramLabels(ENGINEERING_TWINS);
    expect(labels.get('cse')).toBe(
      'B.E. Computer Science and Engineering — CSE · Computer Science and Engineering'
    );
    expect(labels.get('cse-sh')).toBe(
      'B.E. Computer Science and Engineering — CSE-SH · Science and Humanities'
    );
  });
});

describe('buildProgramLabels — collisions a department cannot resolve', () => {
  // Live: "(B.Ed) - Pedagogy of Social Science" exists twice in the SAME
  // department. Qualifying by department alone would leave these identical.
  const bed: Row[] = [
    row('bed-1', '(B.Ed) - Pedagogy of Social Science', 'BED-1', 'Bachelor of Education'),
    row('bed-10', '(B.Ed) - Pedagogy of Social Science', 'BED-10', 'Bachelor of Education')
  ];

  it('falls back on the programme code when departments match', () => {
    const labels = buildProgramLabels(bed);
    expect(labels.get('bed-1')).not.toBe(labels.get('bed-10'));
    expect(labels.get('bed-1')).toContain('BED-1');
    expect(labels.get('bed-10')).toContain('BED-10');
  });
});

describe('buildProgramLabels — leaves unambiguous names alone', () => {
  it('renders a unique programme name with no qualifier', () => {
    const labels = buildProgramLabels([
      row('pcse', 'M.E. Computer Science and Engineering', 'PCSE', 'Computer Science and Engineering (PG)')
    ]);
    expect(labels.get('pcse')).toBe('M.E. Computer Science and Engineering');
  });

  it('keeps school grade rows clean — no department clutter on GRADE 1', () => {
    const schoolGrades: Row[] = [
      row('prekg', 'PREKG', 'PREKG', 'Primary'),
      row('lkg', 'LKG', 'LKG', 'Primary'),
      row('g1', 'GRADE 1', 'GRADE-1', 'Primary')
    ];
    const labels = buildProgramLabels(schoolGrades);
    expect([...labels.values()]).toEqual(['PREKG', 'LKG', 'GRADE 1']);
  });

  it('returns an empty map for an empty picker', () => {
    expect(buildProgramLabels([]).size).toBe(0);
  });
});

describe('buildProgramLabels — null department (the !inner trap)', () => {
  // Three live programmes have a null department_id. A `!inner` join drops
  // them outright (live count 120 → 117), so the query uses a LEFT join and
  // the label must survive a null department rather than printing a gap.
  it('qualifies on the code alone when the department is missing', () => {
    const labels = buildProgramLabels([
      row('a', 'B.Ed (Historical Aggregate)', 'BED-HIST-AGG', null),
      row('b', 'B.Ed (Historical Aggregate)', 'BED-HIST-2', null)
    ]);
    expect(labels.get('a')).toBe('B.Ed (Historical Aggregate) — BED-HIST-AGG');
    expect(labels.get('b')).toBe('B.Ed (Historical Aggregate) — BED-HIST-2');
    expect(labels.get('a')).not.toContain('—  ');
  });

  it('handles a department row whose name itself is null', () => {
    const labels = buildProgramLabels([
      row('a', 'M.A. ENGLISH', 'MA-ENG-AIDED', null),
      row('b', 'M.A. ENGLISH', 'MA-ENG', '   ')
    ]);
    expect(labels.get('a')).toBe('M.A. ENGLISH — MA-ENG-AIDED');
    expect(labels.get('b')).toBe('M.A. ENGLISH — MA-ENG');
  });
});
