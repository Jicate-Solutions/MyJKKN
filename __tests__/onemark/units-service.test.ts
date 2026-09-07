/**
 * lib/services/onemark/units-service — the OneMark unit list, subject first.
 *
 * The fixtures below mirror PRODUCTION as measured 2026-09-07: two subjects
 * whose unit-list positions BOTH start at 1, and an English sentinel at 99.
 * That is precisely the shape that made the shared coaching grid interleave
 * Electrostatics against Two Gentlemen of Verona, so a test that passes on a
 * tidier fixture would prove nothing.
 *
 * Pure functions; no Supabase.
 */
import { describe, it, expect } from 'vitest';
import {
  ONEMARK_SUBJECT_KEYS,
  SENTINEL_FLOOR,
  TAMIL_TBD,
  buildUnitsPayload,
  hasTamilScript,
  isOneMarkUnitKey,
  isOrderedBySubjectPosition,
  isSentinelPosition,
  nextFreePosition,
  reorderPlan,
  slugifyUnitName,
  subjectShortName,
  tamilNameOf,
  unitConfigKey,
  type RawExam,
  type RawItemCount,
  type RawMapping,
  type RawTopic,
} from '@/lib/services/onemark/units-service';

const PHY = '11111111-1111-4111-8111-111111111111';
const ENG = '22222222-2222-4222-8222-222222222222';

const exams: RawExam[] = [
  { id: PHY, config_key: 'tn_hsc_physics', display_name: 'TN State Board — HSC Physics (Class 12)' },
  { id: ENG, config_key: 'tn_hsc_english', display_name: 'TN State Board — HSC English (Class 12)' },
];

/** Physics 1..3, English 1..2 + the 99 grammar sentinel — production's shape. */
const mappings: RawMapping[] = [
  { exam_definition_id: PHY, topic_id: 'p1', sort_order: 1 },
  { exam_definition_id: PHY, topic_id: 'p2', sort_order: 2 },
  { exam_definition_id: PHY, topic_id: 'p3', sort_order: 3 },
  { exam_definition_id: ENG, topic_id: 'e1', sort_order: 1 },
  { exam_definition_id: ENG, topic_id: 'e2', sort_order: 2 },
  { exam_definition_id: ENG, topic_id: 'eg', sort_order: 99 },
];

const topics: RawTopic[] = [
  {
    id: 'p1',
    config_key: 'onemark_phy_u01',
    display_name: 'Unit 1: Electrostatics',
    description: 'மின்னியல் (Vol. 1)',
    is_active: true,
    is_system: true,
  },
  {
    id: 'p2',
    config_key: 'onemark_phy_u02',
    display_name: 'Unit 2: Current Electricity',
    description: 'மின்னோட்டவியல் (Vol. 1)',
    is_active: true,
    is_system: true,
  },
  {
    id: 'p3',
    config_key: 'onemark_phy_u03',
    display_name: 'Unit 3: Magnetism',
    description: null,
    is_active: false,
    is_system: true,
  },
  {
    id: 'e1',
    config_key: 'onemark_eng_u01',
    display_name: 'Unit 1: Two Gentlemen of Verona',
    description: 'Prose: Two Gentlemen of Verona · Poem: The Castle',
    is_active: true,
    is_system: true,
  },
  {
    id: 'e2',
    config_key: 'onemark_eng_u02',
    display_name: 'Unit 2: A Nice Cup of Tea',
    description: null,
    is_active: true,
    is_system: true,
  },
  {
    id: 'eg',
    config_key: 'onemark_eng_grammar_general',
    display_name: 'Grammar (General) — not anchored to any lesson',
    description: 'Grammar_General — not anchored to any lesson',
    is_active: true,
    is_system: true,
  },
];

const itemCounts: RawItemCount[] = [
  { topic_id: 'e1', is_active: true },
  { topic_id: 'p1', is_active: true },
  { topic_id: 'p1', is_active: false },
  { topic_id: 'p1', is_active: false },
  { topic_id: null, is_active: true }, // an item with no unit — must not crash a count
];

const payload = buildUnitsPayload(exams, mappings, topics, itemCounts);

// ---------------------------------------------------------------------------

describe('subject-first assembly', () => {
  it('emits one section per subject, never one flat list', () => {
    expect(payload.subjects).toHaveLength(2);
    expect(payload.subjects.map((s) => s.exam_key)).toEqual(['tn_hsc_physics', 'tn_hsc_english']);
  });

  it('orders each section by its own exam_topic_map position', () => {
    expect(payload.subjects[0].units.map((u) => u.display_name)).toEqual([
      'Unit 1: Electrostatics',
      'Unit 2: Current Electricity',
      'Unit 3: Magnetism',
    ]);
    expect(payload.subjects[1].units.map((u) => u.position)).toEqual([1, 2, 99]);
    expect(isOrderedBySubjectPosition(payload.subjects)).toBe(true);
  });

  it('never interleaves the two subjects, though both start at position 1', () => {
    // The regression this whole lane exists for: a flat list ordered by the
    // shared global column puts Electrostatics next to Two Gentlemen of Verona.
    const flat = payload.subjects.flatMap((s) => s.units);
    const positionOnes = flat.filter((u) => u.position === 1);
    expect(positionOnes).toHaveLength(2);
    // Every Physics unit precedes every English unit in the rendered order.
    const lastPhysics = flat.findLastIndex((u) => u.config_key.startsWith('onemark_phy'));
    const firstEnglish = flat.findIndex((u) => u.config_key.startsWith('onemark_eng'));
    expect(lastPhysics).toBeLessThan(firstEnglish);
  });

  it('counts the bank per unit: total, live, waiting for a tick', () => {
    const p1 = payload.subjects[0].units.find((u) => u.topic_id === 'p1');
    expect(p1).toMatchObject({ items_total: 3, items_active: 1, items_awaiting_review: 2 });
    const p2 = payload.subjects[0].units.find((u) => u.topic_id === 'p2');
    expect(p2).toMatchObject({ items_total: 0, items_active: 0, items_awaiting_review: 0 });
    expect(payload.subjects[0]).toMatchObject({ items_total: 3, items_active: 1 });
    expect(payload.subjects[1]).toMatchObject({ items_total: 1, items_active: 1 });
  });

  it('keeps a retired unit in the payload with its questions counted', () => {
    const retired = payload.subjects[0].units.find((u) => u.topic_id === 'p3');
    expect(retired?.is_active).toBe(false);
    // Retire hides from pickers; it does not delete the unit or its questions.
    expect(payload.subjects[0].units.map((u) => u.topic_id)).toContain('p3');
  });

  it('shortens the subject name for a section heading', () => {
    expect(payload.subjects[0].short_name).toBe('Physics');
    expect(subjectShortName('TN State Board — HSC English (Class 12)')).toBe('English');
  });

  it('drops a mapping whose topic row is missing rather than rendering a blank row', () => {
    const p = buildUnitsPayload(
      exams,
      [...mappings, { exam_definition_id: PHY, topic_id: 'ghost', sort_order: 4 }],
      topics,
      [],
    );
    expect(p.subjects[0].units).toHaveLength(3);
  });

  it('renders an empty subject as an empty section, not a missing one', () => {
    const p = buildUnitsPayload(exams, [], [], []);
    expect(p.subjects).toHaveLength(2);
    expect(p.subjects[0].units).toEqual([]);
    expect(p.subjects[0].items_total).toBe(0);
  });
});

// ---------------------------------------------------------------------------

describe('positions and the sentinel', () => {
  it('treats 99 as a sentinel and 11 as a real unit', () => {
    expect(isSentinelPosition(99)).toBe(true);
    expect(isSentinelPosition(SENTINEL_FLOOR)).toBe(true);
    expect(isSentinelPosition(11)).toBe(false);
  });

  it('puts a new unit after the last REAL unit, not after the sentinel', () => {
    // English is 1, 2, 99 -> the next unit is 3, so the grammar bucket stays last.
    expect(nextFreePosition([1, 2, 99])).toBe(3);
    expect(nextFreePosition([1, 2, 3, 4, 5, 6, 99])).toBe(7);
    expect(nextFreePosition([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe(12);
  });

  it('starts a subject with no units at 1', () => {
    expect(nextFreePosition([])).toBe(1);
    expect(nextFreePosition([99])).toBe(1);
  });

  it('fills a gap by appending, never by reusing a freed number', () => {
    // A retired unit keeps its position, so 1,2,4 means 3 was moved, not free.
    expect(nextFreePosition([1, 2, 4])).toBe(5);
  });
});

describe('re-ordering', () => {
  const units = payload.subjects[1].units; // English: 1, 2, 99

  it('swaps two positions and touches nothing else', () => {
    const plan = reorderPlan(units, 'e2', 'up');
    expect(plan).toEqual([
      { topic_id: 'e2', position: 1 },
      { topic_id: 'e1', position: 2 },
    ]);
  });

  it('is a no-op at either end of the unit list', () => {
    expect(reorderPlan(units, 'e1', 'up')).toEqual([]);
    // e2 is the LAST movable unit — the 99 sentinel is not stepped over.
    expect(reorderPlan(units, 'e2', 'down')).toEqual([]);
  });

  it('never moves the sentinel', () => {
    expect(reorderPlan(units, 'eg', 'up')).toEqual([]);
    expect(reorderPlan(units, 'eg', 'down')).toEqual([]);
  });

  it('is a no-op for a unit that is not in the subject', () => {
    expect(reorderPlan(units, 'p1', 'up')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('unit keys', () => {
  it('mints an immutable onemark_ key from the subject and the name', () => {
    expect(unitConfigKey('tn_hsc_physics', 'Unit 12: Semiconductor Devices', [], 12)).toBe(
      'onemark_phy_unit_12_semiconductor_devices',
    );
    expect(unitConfigKey('tn_hsc_english', 'Unit 7: The Model Millionaire', [], 7)).toBe(
      'onemark_eng_unit_7_the_model_millionaire',
    );
  });

  it('suffixes a collision rather than overwriting a live unit', () => {
    const taken = ['onemark_phy_optics'];
    expect(unitConfigKey('tn_hsc_physics', 'Optics', taken, 5)).toBe('onemark_phy_optics_2');
    expect(unitConfigKey('tn_hsc_physics', 'Optics', [...taken, 'onemark_phy_optics_2'], 5)).toBe(
      'onemark_phy_optics_3',
    );
  });

  it('falls back to a positional key when the name has no ASCII slug', () => {
    expect(unitConfigKey('tn_hsc_physics', 'மின்னியல்', [], 4)).toBe('onemark_phy_u04');
  });

  it('slugifies without leaving stray separators', () => {
    expect(slugifyUnitName('  Unit 1: Ray Optics — Vol. 2  ')).toBe('unit_1_ray_optics_vol_2');
    expect(slugifyUnitName('!!!')).toBe('');
  });

  it('recognises only OneMark unit keys — the write fence', () => {
    expect(isOneMarkUnitKey('onemark_phy_u01')).toBe(true);
    expect(isOneMarkUnitKey('general_knowledge')).toBe(false);
    expect(isOneMarkUnitKey('sch_physics')).toBe(false);
    expect(isOneMarkUnitKey(null)).toBe(false);
    expect(isOneMarkUnitKey(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Tamil names', () => {
  it('reads a Tamil name out of the description where Wave 1 put it', () => {
    expect(tamilNameOf('மின்னியல் (Vol. 1)')).toBe('மின்னியல் (Vol. 1)');
  });

  it('does not mistake an English blurb for a Tamil name', () => {
    expect(tamilNameOf('Prose: Two Gentlemen of Verona · Poem: The Castle')).toBeNull();
    expect(tamilNameOf(null)).toBeNull();
    expect(tamilNameOf('')).toBeNull();
  });

  it('marks every Tamil name it finds as unreviewed — nothing records a sign-off', () => {
    const withTamil = payload.subjects[0].units.find((u) => u.topic_id === 'p1');
    expect(withTamil?.tamil_name).toBe('மின்னியல் (Vol. 1)');
    expect(withTamil?.tamil_needs_review).toBe(true);

    const withoutTamil = payload.subjects[1].units.find((u) => u.topic_id === 'e1');
    expect(withoutTamil?.tamil_name).toBeNull();
    expect(withoutTamil?.tamil_needs_review).toBe(false);
  });

  it('detects the Tamil block', () => {
    expect(hasTamilScript('ஒளிக்கதிரியல்')).toBe(true);
    expect(hasTamilScript('Ray Optics')).toBe(false);
    expect(hasTamilScript(null)).toBe(false);
  });

  it('exposes the rule #24 placeholder for a unit with no Tamil name', () => {
    expect(TAMIL_TBD).toBe('[TAMIL_TBD]');
  });
});

describe('subject set', () => {
  it('names exactly the two OneMark subjects — not the tn_hsc umbrella, not SSLC', () => {
    expect([...ONEMARK_SUBJECT_KEYS]).toEqual(['tn_hsc_physics', 'tn_hsc_english']);
    // Live 2026-09-07 the catalogue also holds tn_hsc and tn_sslc; a tn_hsc%
    // pattern would sweep them in. The set is explicit for that reason.
    expect(ONEMARK_SUBJECT_KEYS).not.toContain('tn_hsc');
    expect(ONEMARK_SUBJECT_KEYS).not.toContain('tn_sslc');
  });
});
