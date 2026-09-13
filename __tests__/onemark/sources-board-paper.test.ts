/**
 * OneMark — the board-paper tick.
 *
 * The record is append-only, so the two rules that carry weight are the
 * collision rule (one tick per question, year and sitting — with a NULL sitting
 * colliding with another NULL sitting, exactly as the database's expression
 * index does) and the ownership rule (only the author may remove their own).
 */
import { describe, it, expect } from 'vitest';
import {
  MAX_BOARD_QNO,
  MIN_EXAM_YEAR,
  alreadyTicked,
  canRemoveHit,
  describeHit,
  hitCollisionKey,
  hitsByItem,
  isUuid,
  normalizeSearch,
  normalizeSitting,
  questionPreview,
  validateNewHit,
  type BoardPaperHit,
} from '@/lib/services/onemark/sources-board-paper';

const EXAM = '11111111-1111-1111-1111-111111111111';
const ITEM = '22222222-2222-2222-2222-222222222222';
const AUTHOR = '33333333-3333-3333-3333-333333333333';
const OTHER = '44444444-4444-4444-4444-444444444444';

function hit(over: Partial<BoardPaperHit> = {}): BoardPaperHit {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    exam_definition_id: EXAM,
    exam_year: 2025,
    sitting: null,
    item_id: ITEM,
    match_kind: 'exact',
    board_qno: 7,
    note: null,
    noted_by: AUTHOR,
    noted_at: '2026-09-07T00:00:00Z',
    ...over,
  };
}

describe('validateNewHit', () => {
  it('accepts a complete tick', () => {
    const res = validateNewHit(
      { exam_definition_id: EXAM, exam_year: 2025, item_id: ITEM, match_kind: 'exact', board_qno: 7 },
      2026,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({ exam_year: 2025, match_kind: 'exact', board_qno: 7, sitting: null });
  });

  it('refuses a missing or malformed subject and question', () => {
    expect(validateNewHit({ exam_year: 2025, item_id: ITEM, match_kind: 'exact' }, 2026).ok).toBe(false);
    expect(validateNewHit({ exam_definition_id: EXAM, exam_year: 2025, match_kind: 'exact' }, 2026).ok).toBe(false);
    expect(
      validateNewHit(
        { exam_definition_id: 'not-a-uuid', exam_year: 2025, item_id: ITEM, match_kind: 'exact' },
        2026,
      ).ok,
    ).toBe(false);
  });

  it('refuses a year outside the board window, and allows next year for an early record', () => {
    const base = { exam_definition_id: EXAM, item_id: ITEM, match_kind: 'exact' as const };
    expect(validateNewHit({ ...base, exam_year: MIN_EXAM_YEAR - 1 }, 2026).ok).toBe(false);
    expect(validateNewHit({ ...base, exam_year: 2028 }, 2026).ok).toBe(false);
    expect(validateNewHit({ ...base, exam_year: 2027 }, 2026).ok).toBe(true);
    expect(validateNewHit({ ...base, exam_year: 2025.5 }, 2026).ok).toBe(false);
  });

  it('refuses anything but exact or near — there is no third kind of match', () => {
    const base = { exam_definition_id: EXAM, item_id: ITEM, exam_year: 2025 };
    expect(validateNewHit({ ...base, match_kind: 'maybe' }, 2026).ok).toBe(false);
    expect(validateNewHit({ ...base, match_kind: 'near' }, 2026).ok).toBe(true);
    expect(validateNewHit({ ...base }, 2026).ok).toBe(false);
  });

  it('treats an empty board question number as "not recorded", not as zero', () => {
    const base = { exam_definition_id: EXAM, item_id: ITEM, exam_year: 2025, match_kind: 'exact' as const };
    for (const empty of ['', null, undefined]) {
      const res = validateNewHit({ ...base, board_qno: empty }, 2026);
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.value.board_qno).toBeNull();
    }
    expect(validateNewHit({ ...base, board_qno: 0 }, 2026).ok).toBe(false);
    expect(validateNewHit({ ...base, board_qno: MAX_BOARD_QNO + 1 }, 2026).ok).toBe(false);
  });

  it('folds a blank sitting to null so it collides with the other blanks', () => {
    const base = { exam_definition_id: EXAM, item_id: ITEM, exam_year: 2025, match_kind: 'exact' as const };
    const res = validateNewHit({ ...base, sitting: '   ' }, 2026);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.sitting).toBeNull();
  });
});

describe('normalizeSitting', () => {
  it('trims, collapses inner spaces and caps the length', () => {
    expect(normalizeSitting('  June   Supplementary ')).toBe('June Supplementary');
    expect(normalizeSitting('x'.repeat(60))?.length).toBe(40);
  });

  it('reads empty, whitespace and non-text all as "one sitting that year"', () => {
    expect(normalizeSitting('')).toBeNull();
    expect(normalizeSitting('  ')).toBeNull();
    expect(normalizeSitting(7)).toBeNull();
    expect(normalizeSitting(null)).toBeNull();
  });
});

describe('the collision rule mirrors the database index', () => {
  it('makes two NULL sittings collide, which is the whole reason for the COALESCE', () => {
    expect(hitCollisionKey({ item_id: ITEM, exam_year: 2025, sitting: null })).toBe(
      hitCollisionKey({ item_id: ITEM, exam_year: 2025, sitting: null }),
    );
  });

  it('keeps two named sittings of the same year apart', () => {
    expect(hitCollisionKey({ item_id: ITEM, exam_year: 2025, sitting: 'March' })).not.toBe(
      hitCollisionKey({ item_id: ITEM, exam_year: 2025, sitting: 'June' }),
    );
  });

  it('finds an existing tick so the screen can grey the row instead of hitting a constraint', () => {
    const existing = [hit({ exam_year: 2025, sitting: null })];
    expect(alreadyTicked(existing, { item_id: ITEM, exam_year: 2025, sitting: null })).not.toBeNull();
    expect(alreadyTicked(existing, { item_id: ITEM, exam_year: 2024, sitting: null })).toBeNull();
    expect(alreadyTicked(existing, { item_id: ITEM, exam_year: 2025, sitting: 'March' })).toBeNull();
  });
});

describe('canRemoveHit — append-only means the author corrects their own claim', () => {
  it('lets the author remove their own tick', () => {
    expect(canRemoveHit(hit({ noted_by: AUTHOR }), AUTHOR)).toBe(true);
  });

  it('refuses somebody else, even another question author', () => {
    expect(canRemoveHit(hit({ noted_by: AUTHOR }), OTHER)).toBe(false);
  });

  it('refuses an orphan tick with no recorded author rather than letting anyone claim it', () => {
    expect(canRemoveHit(hit({ noted_by: null }), AUTHOR)).toBe(false);
  });
});

describe('search', () => {
  it('refuses a term too short to be useful, so a blank search cannot return the bank', () => {
    expect(normalizeSearch('')).toBeNull();
    expect(normalizeSearch('ab')).toBeNull();
    expect(normalizeSearch(undefined)).toBeNull();
  });

  it('strips the characters PostgREST would read as wildcards or separators', () => {
    expect(normalizeSearch('magnetic%flux')).toBe('magnetic flux');
    expect(normalizeSearch('a_b,c')).toBe('a b c');
  });

  it('keeps an ordinary phrase intact', () => {
    expect(normalizeSearch('  the SI unit of  magnetic flux ')).toBe('the SI unit of magnetic flux');
  });
});

describe('presentation helpers', () => {
  it('shortens a long wording with an ellipsis and leaves a short one alone', () => {
    expect(questionPreview('short question')).toBe('short question');
    const long = questionPreview('x'.repeat(400));
    expect(long.length).toBe(160);
    expect(long.endsWith('…')).toBe(true);
  });

  it('describes a tick in one line, skipping what was never recorded', () => {
    expect(describeHit(hit({ sitting: 'March', board_qno: 12, match_kind: 'near' }))).toBe(
      '2025 · March · Q12 · near',
    );
    expect(describeHit(hit({ sitting: null, board_qno: null }))).toBe('2025 · exact');
  });

  it('groups ticks by question so a list needs no lookup per row', () => {
    const grouped = hitsByItem([hit(), hit({ id: 'b', exam_year: 2024 }), hit({ id: 'c', item_id: OTHER })]);
    expect(grouped.get(ITEM)).toHaveLength(2);
    expect(grouped.get(OTHER)).toHaveLength(1);
  });

  it('recognises a uuid and rejects anything else', () => {
    expect(isUuid(ITEM)).toBe(true);
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(7)).toBe(false);
  });
});
