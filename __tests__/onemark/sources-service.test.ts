/**
 * OneMark — the rules around the question-source list.
 *
 * The three that matter, and the failure each one prevents:
 *   · the key is fixed at birth      -> a rename would orphan every question
 *   · a built-in row cannot retire   -> the ingestion and drafting jobs write
 *                                       `past_board_exam` / `internal` by name
 *   · retired hides, never deletes   -> a delete blanks provenance for good
 *
 * Pure functions, so no mocks and no database.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SORT_ORDER,
  MAX_LABEL_LENGTH,
  UNRECORDED_SOURCE_LABEL,
  countsBySource,
  normalizeSourceKeys,
  pickerSources,
  slugifySourceKey,
  sortSources,
  sourceLabel,
  unrecordedCount,
  validateNewSource,
  validateSourceUpdate,
  withCounts,
  type OneMarkSourceRow,
} from '@/lib/services/onemark/sources-service';

function row(over: Partial<OneMarkSourceRow> = {}): OneMarkSourceRow {
  return {
    key: 'textbook_back',
    label: 'Textbook back exercise',
    description: null,
    is_system: true,
    is_active: true,
    sort_order: 10,
    ...over,
  };
}

const SEEDED: OneMarkSourceRow[] = [
  row(),
  row({ key: 'past_board_exam', label: 'Past board paper', sort_order: 20 }),
  row({ key: 'district_revision', label: 'District revision paper', sort_order: 30 }),
  row({ key: 'model_paper', label: 'Model paper', sort_order: 40 }),
  row({ key: 'internal', label: 'Internal', sort_order: 50 }),
];

describe('slugifySourceKey', () => {
  it('turns a plain-language name into the seed shape', () => {
    expect(slugifySourceKey('District revision paper')).toBe('district_revision_paper');
    expect(slugifySourceKey('Model  paper')).toBe('model_paper');
  });

  it('collapses punctuation and trims the edges rather than leaving stray underscores', () => {
    expect(slugifySourceKey('  Past board paper (2024) — March!  ')).toBe('past_board_paper_2024_march');
    expect(slugifySourceKey('***')).toBe('');
  });

  it('folds accents so two names that read identically do not become two keys', () => {
    expect(slugifySourceKey('Modèle')).toBe(slugifySourceKey('Modele'));
  });

  it('never ends on an underscore, even when the cut lands on one', () => {
    const key = slugifySourceKey('a'.repeat(47) + ' b');
    expect(key.endsWith('_')).toBe(false);
  });
});

describe('validateNewSource', () => {
  it('derives the key from the label and marks the row as not built in', () => {
    const res = validateNewSource({ label: 'Weekly slip paper' }, SEEDED.map((s) => s.key));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({
      key: 'weekly_slip_paper',
      label: 'Weekly slip paper',
      is_system: false,
      is_active: true,
      sort_order: DEFAULT_SORT_ORDER,
    });
  });

  it('refuses a name that collides with an existing key, and says to switch the old one back on', () => {
    const res = validateNewSource({ label: 'Model Paper' }, SEEDED.map((s) => s.key));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/already exists/i);
    expect(res.error).toMatch(/switch/i);
  });

  it('counts a RETIRED key as taken — its key still sits on its questions', () => {
    const withRetired = [...SEEDED, row({ key: 'old_bank', label: 'Old bank', is_active: false })];
    const res = validateNewSource({ label: 'Old bank' }, withRetired.map((s) => s.key));
    expect(res.ok).toBe(false);
  });

  it('refuses a name with nothing to build an identifier from', () => {
    const res = validateNewSource({ label: '###' }, []);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/no letters or numbers/i);
  });

  it('refuses an empty name, a non-string name and an over-long name', () => {
    expect(validateNewSource({ label: '   ' }, []).ok).toBe(false);
    expect(validateNewSource({ label: 42 }, []).ok).toBe(false);
    expect(validateNewSource({ label: 'x'.repeat(MAX_LABEL_LENGTH + 1) }, []).ok).toBe(false);
  });

  it('refuses a position that is not a whole number in range', () => {
    expect(validateNewSource({ label: 'A', sort_order: 1.5 }, []).ok).toBe(false);
    expect(validateNewSource({ label: 'A', sort_order: -1 }, []).ok).toBe(false);
    expect(validateNewSource({ label: 'A', sort_order: 99999 }, []).ok).toBe(false);
    expect(validateNewSource({ label: 'A', sort_order: 25 }, []).ok).toBe(true);
  });
});

describe('validateSourceUpdate — the key is immutable', () => {
  it('refuses a patch that carries a different key, loudly rather than ignoring it', () => {
    const res = validateSourceUpdate(row(), { key: 'something_else', label: 'New name' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/identifier is fixed/i);
  });

  it('allows a patch that repeats the row own key', () => {
    const res = validateSourceUpdate(row(), { key: 'textbook_back', label: 'Back exercise' });
    expect(res.ok).toBe(true);
  });

  it('never emits the key in the patch value, so an UPDATE can never write it', () => {
    const res = validateSourceUpdate(row(), { label: 'Back exercise', sort_order: 5 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(Object.keys(res.value).sort()).toEqual(['label', 'sort_order']);
  });
});

describe('validateSourceUpdate — a built-in source cannot be retired', () => {
  it('refuses to switch off a built-in row and names the reason', () => {
    const res = validateSourceUpdate(row({ is_system: true }), { is_active: false });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/built-in/i);
    expect(res.error).toMatch(/by name/i);
  });

  it('allows a built-in row to be RENAMED and re-ordered', () => {
    const res = validateSourceUpdate(row({ is_system: true }), { label: 'Textbook exercise', sort_order: 15 });
    expect(res.ok).toBe(true);
  });

  it('allows a non-built-in row to be retired and brought back', () => {
    const off = validateSourceUpdate(row({ key: 'weekly', is_system: false }), { is_active: false });
    expect(off.ok).toBe(true);
    const on = validateSourceUpdate(row({ key: 'weekly', is_system: false, is_active: false }), {
      is_active: true,
    });
    expect(on.ok).toBe(true);
  });

  it('refuses a non-boolean switch value', () => {
    expect(validateSourceUpdate(row({ is_system: false }), { is_active: 'false' }).ok).toBe(false);
  });

  it('refuses an empty patch rather than issuing a no-op write', () => {
    const res = validateSourceUpdate(row(), {});
    expect(res.ok).toBe(false);
  });
});

describe('pickerSources — retiring hides from every picker', () => {
  const rows = [
    row({ key: 'a', label: 'A', sort_order: 10 }),
    row({ key: 'b', label: 'B', sort_order: 20, is_active: false }),
    row({ key: 'c', label: 'C', sort_order: 30 }),
  ];

  it('drops a retired source', () => {
    expect(pickerSources(rows).map((r) => r.key)).toEqual(['a', 'c']);
  });

  it('keeps a retired source that is ALREADY ticked, so a saved choice is not dropped silently', () => {
    expect(pickerSources(rows, ['b']).map((r) => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('orders by position, then name', () => {
    const unordered = [
      row({ key: 'z', label: 'Zeta', sort_order: 5 }),
      row({ key: 'y', label: 'Alpha', sort_order: 5 }),
      row({ key: 'x', label: 'Mid', sort_order: 1 }),
    ];
    expect(sortSources(unordered).map((r) => r.key)).toEqual(['x', 'y', 'z']);
  });
});

describe('normalizeSourceKeys — nothing ticked means everything', () => {
  const known = SEEDED.map((s) => s.key);

  it('returns an empty list for a non-array, so a bad body cannot produce an empty sitting', () => {
    expect(normalizeSourceKeys(undefined, known)).toEqual([]);
    expect(normalizeSourceKeys('internal', known)).toEqual([]);
    expect(normalizeSourceKeys(null, known)).toEqual([]);
  });

  it('drops unknown keys and duplicates and non-strings', () => {
    expect(normalizeSourceKeys(['internal', 'internal', 'nope', 7, ''], known)).toEqual(['internal']);
  });

  it('treats "every source ticked" as the same request as "none ticked"', () => {
    expect(normalizeSourceKeys([...known], known)).toEqual([]);
  });

  it('keeps a genuine subset in the order it arrived', () => {
    expect(normalizeSourceKeys(['model_paper', 'internal'], known)).toEqual(['model_paper', 'internal']);
  });
});

describe('sourceLabel', () => {
  it('names the no-source bucket rather than showing a blank', () => {
    expect(sourceLabel(SEEDED, null)).toBe(UNRECORDED_SOURCE_LABEL);
    expect(sourceLabel(SEEDED, undefined)).toBe(UNRECORDED_SOURCE_LABEL);
    expect(sourceLabel(SEEDED, '')).toBe(UNRECORDED_SOURCE_LABEL);
  });

  it('falls back to the key itself when the row is gone, never to "Unknown"', () => {
    expect(sourceLabel(SEEDED, 'ghost_key')).toBe('ghost_key');
  });

  it('reads the label from the table, which is the only place labels live', () => {
    expect(sourceLabel(SEEDED, 'model_paper')).toBe('Model paper');
  });
});

describe('counts', () => {
  const items = [
    { source_key: 'internal', is_active: true },
    { source_key: 'internal', is_active: false },
    { source_key: 'model_paper', is_active: true },
    { source_key: null, is_active: true },
    { source_key: null, is_active: false },
    { source_key: null, is_active: false },
  ];

  it('counts live and total separately per source', () => {
    const counts = countsBySource(items);
    expect(counts.get('internal')).toEqual({ total: 2, active: 1 });
    expect(counts.get('model_paper')).toEqual({ total: 1, active: 1 });
  });

  it('keeps the questions with no origin as their own bucket', () => {
    expect(unrecordedCount(items)).toEqual({ total: 3, active: 1 });
  });

  it('reports zero for a source nobody has used — an empty source is what you need before retiring it', () => {
    const rows = withCounts(SEEDED, items);
    const textbook = rows.find((r) => r.key === 'textbook_back');
    expect(textbook).toMatchObject({ items_total: 0, items_active: 0 });
    expect(rows).toHaveLength(SEEDED.length);
  });

  it('returns rows in house order', () => {
    expect(withCounts(SEEDED, items).map((r) => r.key)).toEqual([
      'textbook_back',
      'past_board_exam',
      'district_revision',
      'model_paper',
      'internal',
    ]);
  });
});
