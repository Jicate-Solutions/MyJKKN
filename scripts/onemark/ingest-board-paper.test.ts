// scripts/onemark/ingest-board-paper.test.ts
//
// Parser + two-hash dedup invariants for the OneMark board-paper ingester.
// Pure functions only — no Supabase, no filesystem.

import { describe, expect, it } from 'vitest';
import {
  canonicaliseUnderline,
  dedup,
  normalise,
  optionsHash,
  parsePaper,
  stemHash,
  tagFor,
  toRow,
} from './ingest-board-paper';

const ENGLISH = `
Language — Part II — English
PART - I

Choose the most appropriate synonyms of the words underlined in the
following sentences.

1. [unit:1] They were childish enough, and in many ways quite __artless__.
   (a) innocent   (b) humble   (c) playful   (d) generous

2. As trade __slackened__, we went over.
   (a) reduced   (b) increased   (c) improved   (d) started

Choose the most appropriate antonyms of the words underlined in the
following sentences.

3. As trade __slackened__, we went over.
   (a) increased   (b) reduced   (c) fell   (d) stopped

4. One does not feel wiser, braver or more _optimistic_.
   (a) opportunistic   (b) systematic   (c) realistic   (d) pessimistic

5. Choose the correct expansion of the abbreviation TNPSC.
   (a) Tamil Nadu Public Service Commission
   (b) Tamil Nadu Police Service Commission
   (c) Tamil Nadu Public Sector Corporation
   (d) Tamil Nadu Postal Service Commission

6. Add a suitable question tag: Nobody has arrived yet, ______
   (a) haven't they   (b) have they   (c) hasn't he   (d) has he

## Answer Key
1. a
2. a
4. d
6. (b)
`;

const PHYSICS = `
www.watermark.test
1. [unit:1] மின் இருமுனை 2×10⁵ NC⁻¹ புலத்தில் 30° கோணம், 8 Nm திருப்புத்திறன், நீளம் 2 cm எனில் மின்னூட்டம்
   (அ) 2 mC   (ஆ) 4 mC   (இ) 8 mC   (ஈ) 6 mC
   An electric dipole placed at 30° to a uniform electric field of 2×10⁵ NC⁻¹ experiences a torque of 8 Nm. If the dipole length is 2 cm, the charge on the dipole is
   (a) 2 mC   (b) 4 mC   (c) 8 mC   (d) 6 mC
   Answer: (ஆ)

2. [unit:5] 1/µ₀ε₀ இன் பரிமாணம்
   (அ) [L T⁻¹]   (ஆ) [L² T⁻²]   (இ) [L⁻² T²]   (ஈ) [L T]
   The dimension of 1/µ₀ε₀ is
   (a) [L T⁻¹]
   (b) [L² T⁻²]
   (c) [L⁻² T²]
   (d) [L T]

3. [unit:8] வெப்பத்தை உட்கவர்ந்து எலக்ட்ரான் உமிழ்வு ________ உமிழ்வு எனப்படும்.
   (அ) ஒளிமின்   (ஆ) வெப்ப அயனி   (இ) புல   (ஈ) இரண்டாம் நிலை
   Electron emission by absorption of heat is called ________ emission.
   (a) photoelectric   (b) thermionic   (c) field   (d) secondary
`;

describe('normalise', () => {
  it('lowercases, strips punctuation and underline markers, collapses whitespace', () => {
    expect(normalise('As trade <u>slackened</u>,   we  went over.')).toBe(
      'as trade slackened we went over',
    );
    expect(normalise('As trade __slackened__, we went over.')).toBe(
      normalise('As trade slackened, we went over'),
    );
  });

  it('keeps the notation that distinguishes Physics numerics', () => {
    expect(normalise('2×10⁵ NC⁻¹')).toBe('2×10⁵ nc⁻¹');
  });
});

describe('canonicaliseUnderline', () => {
  it('maps __word__ and _word_ to <u>word</u>', () => {
    expect(canonicaliseUnderline('quite __artless__.')).toBe('quite <u>artless</u>.');
    expect(canonicaliseUnderline('more _optimistic_.')).toBe('more <u>optimistic</u>.');
  });
});

describe('parsePaper — English (PRD English B.2 directive scope)', () => {
  const qs = parsePaper(ENGLISH, 'tn_hsc_english');

  it('reads every numbered question', () => {
    expect(qs.map((q) => q.qno)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('applies the grouped directive to Q1–Q2 (synonyms) and Q3–Q4 (antonyms)', () => {
    expect(qs[0].tags).toEqual(['synonyms']);
    expect(qs[1].tags).toEqual(['synonyms']);
    expect(qs[2].tags).toEqual(['antonyms']);
    expect(qs[3].tags).toEqual(['antonyms']);
  });

  it('ends the run at the first self-directing stem', () => {
    expect(qs[4].directive).toBeNull();
    expect(qs[4].tags).toEqual(['abbreviations']);
    expect(qs[5].tags).toEqual(['question_tags']);
  });

  it('stores the underline span as <u>…</u> and pins the unit', () => {
    expect(qs[0].stemEn).toContain('<u>artless</u>');
    expect(qs[0].unit).toBe(1);
    expect(qs[1].unit).toBeNull();
  });

  it('merges the trailing answer key; a question without one stays null', () => {
    expect(qs[0].answer).toBe('A');
    expect(qs[3].answer).toBe('D');
    expect(qs[5].answer).toBe('B');
    expect(qs[2].answer).toBeNull();
    expect(qs[4].answer).toBeNull();
  });

  it('parses four options with the paper letters mapped to A–D', () => {
    expect(qs[0].optionsEn.map((o) => o.key)).toEqual(['A', 'B', 'C', 'D']);
    expect(qs[0].optionsEn[0].text).toBe('innocent');
    expect(qs[4].optionsEn[3].text).toBe('Tamil Nadu Postal Service Commission');
  });
});

describe('parsePaper — Physics (Tamil block then English block)', () => {
  const qs = parsePaper(PHYSICS, 'tn_hsc_physics');

  it('drops watermark lines and reads three questions', () => {
    expect(qs).toHaveLength(3);
  });

  it('splits the Tamil stem/options from the English stem/options', () => {
    expect(qs[0].stemTa).toMatch(/மின் இருமுனை/);
    expect(qs[0].stemEn).toMatch(/^An electric dipole/);
    expect(qs[0].optionsTa?.map((o) => o.text)).toEqual(['2 mC', '4 mC', '8 mC', '6 mC']);
    expect(qs[0].optionsEn.map((o) => o.text)).toEqual(['2 mC', '4 mC', '8 mC', '6 mC']);
  });

  it('reads an inline Tamil answer letter', () => {
    expect(qs[0].answer).toBe('B');
  });

  it('handles one-option-per-line English options', () => {
    expect(qs[1].optionsEn.map((o) => o.text)).toEqual(['[L T⁻¹]', '[L² T⁻²]', '[L⁻² T²]', '[L T]']);
  });

  it('tags from the rule table in order', () => {
    expect(qs[0].tags).toEqual(['numerical_single_step']);
    expect(qs[1].tags).toEqual(['dimensional_analysis']);
    expect(qs[2].tags).toEqual(['fill_in_blank']);
  });
});

describe('tagFor', () => {
  it('returns [] when no rule matches so the reviewer sees an untagged draft', () => {
    expect(tagFor('tn_hsc_english', 'Some stem with nothing recognisable.', null)).toEqual([]);
  });
});

describe('dedup — two hashes: content/options collisions skip, a stem-only collision is FLAGGED (PRD English B.3)', () => {
  const qs = parsePaper(ENGLISH, 'tn_hsc_english');

  it('keeps the antonym twin of a synonym stem (Q3 vs Q2) and flags it for the reviewer', () => {
    const { keep, skipped, flagged } = dedup(qs, new Set(), new Set());
    expect(skipped).toEqual([]);
    expect(flagged.map((f) => [f.q.qno, f.reason])).toEqual([[3, 'stem']]);
    expect(keep.map((q) => q.qno)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(qs[2].notes.some((n) => /possible duplicate/.test(n))).toBe(true);
  });

  it('skips a true duplicate — same stem AND same options set', () => {
    const twin = { ...qs[1], qno: 99, notes: [] };
    const { keep, skipped, flagged } = dedup([qs[1], twin], new Set(), new Set());
    expect(keep.map((q) => q.qno)).toEqual([2]);
    expect(skipped.map((s) => [s.q.qno, s.reason])).toEqual([[99, 'content']]);
    expect(flagged).toEqual([]);
  });

  it('skips a new stem that reuses an existing options set (lane spec, [risky])', () => {
    const existingOpts = new Set([optionsHash(qs[3].optionsEn)]);
    const { skipped, flagged } = dedup([qs[3]], new Set(), existingOpts);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('options');
    expect(flagged).toEqual([]);
  });

  it('flags against a bank stem hash seeded from an existing row, and still inserts', () => {
    const existingStems = new Set([stemHash('They were childish enough, and in many ways quite artless.')]);
    const { keep, skipped, flagged } = dedup([qs[0]], existingStems, new Set());
    expect(skipped).toEqual([]);
    expect(flagged.map((f) => f.reason)).toEqual(['stem']);
    expect(keep).toHaveLength(1);
  });

  it('hashes the stem column as written: a Tamil-only question is hashed on its Tamil stem', () => {
    const tamilOnly = parsePaper(
      '1. மின் இருமுனை மின்னூட்டம் என்பது\n   (a) 2 mC   (b) 4 mC   (c) 8 mC   (d) 6 mC\n',
      'tn_hsc_physics',
    );
    expect(tamilOnly[0].stemEn).toBe(tamilOnly[0].stemTa);
    const { flagged } = dedup(tamilOnly, new Set([stemHash('மின் இருமுனை மின்னூட்டம் என்பது')]), new Set());
    expect(flagged).toHaveLength(1);
  });
});

describe('toRow', () => {
  it('writes a draft with provenance, auto layout and no JABT level', () => {
    const [q] = parsePaper(ENGLISH, 'tn_hsc_english');
    const row = toRow(q, {
      examKey: 'tn_hsc_english',
      year: 2025,
      sitting: 'march',
      series: 'A',
      examDefinitionId: 'exam-uuid',
      topicId: 'topic-uuid',
      createdBy: null,
    });
    expect(row).toMatchObject({
      is_active: false,
      source_key: 'past_board_exam',
      source_year: 2025,
      source_sitting: 'march',
      source_series: 'A',
      source_qno: 1,
      option_layout: 'auto',
      bloom_level: null,
      q_type: 'mcq_single',
      answer: { correct: 'A' },
      tags: ['synonyms'],
    });
  });

  it('marks a missing answer as pending rather than inventing one', () => {
    const qs = parsePaper(ENGLISH, 'tn_hsc_english');
    const row = toRow(qs[4], {
      examKey: 'tn_hsc_english',
      year: 2025,
      sitting: 'march',
      series: 'A',
      examDefinitionId: 'exam-uuid',
      topicId: null,
      createdBy: null,
    });
    expect(row.answer).toEqual({ correct: null, pending: true });
  });
});
