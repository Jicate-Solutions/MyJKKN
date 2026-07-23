// =====================================================================
// PDE <-> BoS Outcome Connector — curriculum service math tests
// =====================================================================
// Covers (spec §7 + §10 empty-state discipline):
//   1. parseSyllabusClos: live JSONB shape, bare-array shape, malformed.
//   2. parsePoMappings: co_id → clo_number convention, malformed entries.
//   3. normalizeCloRefs: dedupe, non-ints dropped, non-arrays → [].
//   4. foldCloAttainment: denominator = participating learners
//      (draft/withdrawn excluded, rejected counts), numerator = passed +
//      validator-confirmed only; 0 participants → null pct (never NaN).
//   5. foldPoAttainment: H/M/L weighted roll-up, exact arithmetic,
//      unknown grades skipped, natural PO sort, empty → [].
// =====================================================================

import { describe, it, expect } from 'vitest';

import {
  foldCloAttainment,
  foldPoAttainment,
  normalizeCloRefs,
  parsePoMappings,
  parseSyllabusClos,
} from '@/lib/services/pde-curriculum-service';
import type {
  AttainmentDemoRow,
  PoMappingEntry,
  SyllabusAttainment,
  SyllabusCLO,
} from '@/lib/types/pde-curriculum';

// ---------------------------------------------------------------------
// Fixtures — mirror the live 24UTFCP07 shapes probed 2026-06-11
// ---------------------------------------------------------------------

const LIVE_CLO_JSONB = {
  clos: [
    { clo_number: 1, description: 'Draft the pattern', k_values: ['K1', 'K2'] },
    { clo_number: 2, description: 'Grade the pattern blocks', k_values: ['K3'] },
    { clo_number: 3, description: 'Create marker planning', k_values: [] },
  ],
};

const LIVE_PO_JSONB = {
  mappings: [
    { co_id: 'CO1', pos: { PO1: 'H', PO2: 'M' }, psos: { PSO1: 'H' } },
    { co_id: 'CO2', pos: { PO1: 'M' }, psos: { PSO1: 'L' } },
  ],
};

function demo(
  learner: string,
  status: string,
  passed: boolean | null,
  confirmed: number[] | null,
): AttainmentDemoRow {
  return { learner_id: learner, status, passed, clo_refs_confirmed: confirmed };
}

const THREE_CLOS: SyllabusCLO[] = parseSyllabusClos(LIVE_CLO_JSONB);

// ---------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------

describe('parseSyllabusClos', () => {
  it('parses the live { clos: [...] } shape and sorts by clo_number', () => {
    const clos = parseSyllabusClos({
      clos: [
        { clo_number: 3, description: 'c', k_values: [] },
        { clo_number: 1, description: 'a', k_values: ['K1'] },
      ],
    });
    expect(clos.map((c) => c.clo_number)).toEqual([1, 3]);
    expect(clos[0].k_values).toEqual(['K1']);
  });

  it('accepts a bare array (JSONB array-or-object rule)', () => {
    const clos = parseSyllabusClos([{ clo_number: 1, description: 'x', k_values: [] }]);
    expect(clos).toHaveLength(1);
  });

  it('skips malformed entries and non-positive clo_numbers', () => {
    const clos = parseSyllabusClos({
      clos: [null, 'junk', { clo_number: 0 }, { clo_number: -2 }, { clo_number: 2 }],
    });
    expect(clos.map((c) => c.clo_number)).toEqual([2]);
  });

  it('returns [] on null / undefined / scalar input', () => {
    expect(parseSyllabusClos(null)).toEqual([]);
    expect(parseSyllabusClos(undefined)).toEqual([]);
    expect(parseSyllabusClos('text')).toEqual([]);
  });
});

describe('parsePoMappings', () => {
  it('derives clo_number from co_id by digit convention', () => {
    const mappings = parsePoMappings(LIVE_PO_JSONB);
    expect(mappings).toHaveLength(2);
    expect(mappings[0].clo_number).toBe(1);
    expect(mappings[1].clo_number).toBe(2);
  });

  it('sets clo_number=null when co_id has no digits', () => {
    const mappings = parsePoMappings({ mappings: [{ co_id: 'COx', pos: { PO1: 'H' }, psos: {} }] });
    expect(mappings[0].clo_number).toBeNull();
  });

  it('tolerates missing pos/psos objects', () => {
    const mappings = parsePoMappings({ mappings: [{ co_id: 'CO1' }] });
    expect(mappings[0].pos).toEqual({});
    expect(mappings[0].psos).toEqual({});
  });
});

describe('normalizeCloRefs', () => {
  it('dedupes, sorts, and drops non-positive-int values', () => {
    expect(normalizeCloRefs([3, 1, 3, '2', 0, -1, 'x', null])).toEqual([1, 2, 3]);
  });

  it('returns [] for non-arrays', () => {
    expect(normalizeCloRefs(null)).toEqual([]);
    expect(normalizeCloRefs({ clos: [1] })).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// CLO attainment fold
// ---------------------------------------------------------------------

describe('foldCloAttainment', () => {
  it('returns null pct for every CLO when zero demos (no divide-by-zero)', () => {
    const { participating_learners, clos } = foldCloAttainment(THREE_CLOS, []);
    expect(participating_learners).toBe(0);
    expect(clos).toHaveLength(3);
    for (const row of clos) {
      expect(row.attainment_pct).toBeNull();
      expect(row.attained_learners).toBe(0);
    }
  });

  it('excludes draft + withdrawn from the participation denominator', () => {
    const { participating_learners } = foldCloAttainment(THREE_CLOS, [
      demo('L1', 'draft', null, null),
      demo('L2', 'withdrawn', null, null),
      demo('L3', 'submitted', null, null),
    ]);
    expect(participating_learners).toBe(1);
  });

  it('counts rejected learners as participating but never attained', () => {
    const { participating_learners, clos } = foldCloAttainment(THREE_CLOS, [
      demo('L1', 'rejected', false, [1]),
      demo('L2', 'scored', true, [1]),
    ]);
    expect(participating_learners).toBe(2);
    const clo1 = clos.find((c) => c.clo_number === 1)!;
    expect(clo1.attained_learners).toBe(1); // only the passed learner
    expect(clo1.attainment_pct).toBe(50);
  });

  it('requires passed=true AND validator confirmation for attainment', () => {
    const { clos } = foldCloAttainment(THREE_CLOS, [
      demo('L1', 'scored', true, null), // passed, nothing confirmed
      demo('L2', 'scored', false, [2]), // confirmed but failed
      demo('L3', 'validated', null, [2]), // confirmed but not yet passed
    ]);
    expect(clos.every((c) => c.attained_learners === 0)).toBe(true);
  });

  it('counts distinct learners, not demos', () => {
    const { clos, participating_learners } = foldCloAttainment(THREE_CLOS, [
      demo('L1', 'scored', true, [1]),
      demo('L1', 'scored', true, [1, 2]), // same learner again
      demo('L2', 'submitted', null, null),
    ]);
    expect(participating_learners).toBe(2);
    expect(clos.find((c) => c.clo_number === 1)!.attained_learners).toBe(1);
    expect(clos.find((c) => c.clo_number === 1)!.attainment_pct).toBe(50);
    expect(clos.find((c) => c.clo_number === 2)!.attainment_pct).toBe(50);
  });
});

// ---------------------------------------------------------------------
// PO/PSO weighted roll-up
// ---------------------------------------------------------------------

const WEIGHTS = { H: 1.0, M: 0.5, L: 0.25 };

function section(
  cloPcts: Record<number, number | null>,
  mappings: PoMappingEntry[],
): { attainment: SyllabusAttainment; mappings: PoMappingEntry[] } {
  const clos = Object.entries(cloPcts).map(([n, pct]) => ({
    clo_number: Number(n),
    description: `CLO${n}`,
    attained_learners: 0,
    participating_learners: pct === null ? 0 : 10,
    attainment_pct: pct,
  }));
  return {
    attainment: {
      syllabus_id: 's1',
      course_code: 'C1',
      course_name: 'Course 1',
      version_number: 1,
      participating_learners: 10,
      demo_count: clos.length,
      clos,
    },
    mappings,
  };
}

describe('foldPoAttainment', () => {
  it('computes the spec §7 weighted mean exactly', () => {
    // CLO1=80% maps PO1:H(1.0); CLO2=40% maps PO1:M(0.5)
    // PO1 = (80*1.0 + 40*0.5) / (1.0+0.5) = 100/1.5 = 66.666→66.7
    const { po } = foldPoAttainment(
      [
        section({ 1: 80, 2: 40 }, [
          { co_id: 'CO1', clo_number: 1, pos: { PO1: 'H' }, psos: {} },
          { co_id: 'CO2', clo_number: 2, pos: { PO1: 'M' }, psos: {} },
        ]),
      ],
      WEIGHTS,
    );
    expect(po).toHaveLength(1);
    expect(po[0].outcome_key).toBe('PO1');
    expect(po[0].attainment_pct).toBe(66.7);
    expect(po[0].total_weight).toBe(1.5);
    expect(po[0].contributing_clos).toBe(2);
  });

  it('skips CLOs with null attainment (no evidence) and unknown grades', () => {
    const { po } = foldPoAttainment(
      [
        section({ 1: null, 2: 60 }, [
          { co_id: 'CO1', clo_number: 1, pos: { PO1: 'H' }, psos: {} }, // null pct → skipped
          { co_id: 'CO2', clo_number: 2, pos: { PO1: 'X' }, psos: {} }, // unknown grade → skipped
        ]),
      ],
      WEIGHTS,
    );
    expect(po).toEqual([]);
  });

  it('aggregates across syllabi and separates PO from PSO', () => {
    const { po, pso } = foldPoAttainment(
      [
        section({ 1: 100 }, [
          { co_id: 'CO1', clo_number: 1, pos: { PO1: 'H' }, psos: { PSO1: 'L' } },
        ]),
        section({ 1: 50 }, [
          { co_id: 'CO1', clo_number: 1, pos: { PO1: 'H' }, psos: {} },
        ]),
      ],
      WEIGHTS,
    );
    // PO1 = (100*1 + 50*1) / 2 = 75
    expect(po[0].attainment_pct).toBe(75);
    expect(pso).toHaveLength(1);
    expect(pso[0].outcome_key).toBe('PSO1');
    expect(pso[0].attainment_pct).toBe(100);
  });

  it('natural-sorts outcome keys (PO2 before PO10)', () => {
    const mappings: PoMappingEntry[] = [
      { co_id: 'CO1', clo_number: 1, pos: { PO10: 'H', PO2: 'H' }, psos: {} },
    ];
    const { po } = foldPoAttainment([section({ 1: 10 }, mappings)], WEIGHTS);
    expect(po.map((r) => r.outcome_key)).toEqual(['PO2', 'PO10']);
  });

  it('returns empty arrays on zero sections', () => {
    const { po, pso } = foldPoAttainment([], WEIGHTS);
    expect(po).toEqual([]);
    expect(pso).toEqual([]);
  });
});
