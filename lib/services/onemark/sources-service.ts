// File: lib/services/onemark/sources-service.ts
//
// OneMark — the question-source list, as rules rather than as a screen.
//
// A source is WHERE a question came from: a textbook back exercise, a past
// board paper, a district revision paper, a model paper, in-house drafting.
// `onemark_item_sources` has held the five seeded rows since Wave 1; what this
// file adds is the law around changing that list, so the API route, the
// management screen and the pickers all obey exactly one set of rules.
//
// Three rules decide almost everything here (Lane Q, Director rulings of
// 2026-09-06):
//
//   1. NOTHING IS EVER DELETED. `fp_items.source_key` is ON DELETE SET NULL, so
//      removing a row would silently blank the provenance of every question
//      that came from it — the one fact a question can never be given back.
//      A source is RETIRED (`is_active = false`): it disappears from every
//      picker, stays on its questions, and shows greyed in analytics.
//   2. THE KEY IS FIXED AT BIRTH. It is the slug of the first label, and it is
//      what `fp_items.source_key` stores. Renaming it would orphan rows, so the
//      LABEL is editable and the key never is.
//   3. A SEEDED ROW IS PERMANENT FURNITURE. `is_system` rows may be relabelled
//      and re-ordered, never retired — the ingestion script and the drafting
//      job write `past_board_exam` and `internal` by name.
//
// Pure functions only: no Supabase, no React, no I/O. Everything here is
// unit-tested in __tests__/onemark/sources-service.test.ts.

/** A row of `onemark_item_sources` as every caller in this lane needs it. */
export interface OneMarkSourceRow {
  key: string;
  label: string;
  description: string | null;
  /** Seeded by Wave 1. Relabelable and re-orderable; never retirable. */
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
  updated_at?: string;
}

/** A source with how many questions point at it. */
export interface OneMarkSourceWithCounts extends OneMarkSourceRow {
  /** Every question carrying this key, live bank plus drafts. */
  items_total: number;
  /** Only the questions a learner can be served (`fp_items.is_active`). */
  items_active: number;
}

/** The shape the create form sends. */
export interface NewSourceInput {
  label?: unknown;
  description?: unknown;
  sort_order?: unknown;
}

/** The shape the edit form sends. Absent field = leave alone. */
export interface SourcePatchInput {
  label?: unknown;
  description?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
}

/** What the route writes for a create. */
export interface NewSourceValue {
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_system: false;
  is_active: true;
}

/** What the route writes for an edit. Only the keys the caller sent. */
export interface SourcePatchValue {
  label?: string;
  description?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

/** A checked value, or the sentence explaining why it is not one.
 *  `value?: never` / `error?: never` on the opposite branches let a caller read
 *  `.error` after `!ok` without a cast — the project compiles with
 *  `strictNullChecks: false`, where a bare discriminated union does not narrow. */
export type Invalid = { ok: false; value?: never; error: string };
export type Valid<T> = { ok: true; value: T; error?: never };
export type Validated<T> = Valid<T> | Invalid;

/** Narrowing helper. `if (isInvalid(x)) return x;` forwards the failure of a
 *  field check as the failure of the whole record, whatever the value types. */
export function isInvalid<T>(v: Validated<T>): v is Invalid {
  return v.ok === false;
}

export const MAX_KEY_LENGTH = 48;
export const MAX_LABEL_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MIN_SORT_ORDER = 0;
export const MAX_SORT_ORDER = 9999;
export const DEFAULT_SORT_ORDER = 100;

/** Lowercase words joined by single underscores — the shape of the five seeds. */
export const SOURCE_KEY_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** The one sentence the API and the UI both say when a delete is attempted. */
export const DELETE_REFUSED_MESSAGE =
  'A source is retired, never deleted. Deleting it would blank the origin recorded on every question that came from it. Switch it off instead — it disappears from the pickers and stays on its questions.';

/** What the analytics screen and the pickers call the questions with no source. */
export const UNRECORDED_SOURCE_LABEL = 'source not recorded';

// ---------------------------------------------------------------------------
// Key derivation
// ---------------------------------------------------------------------------

/** The key a label becomes. Deliberately lossy and deliberately stable:
 *  "District revision paper (2024)" and "district revision paper" both become
 *  `district_revision_paper`, which is what makes the duplicate check useful. */
export function slugifySourceKey(label: string): string {
  return String(label ?? '')
    .normalize('NFKD')
    // Strip combining accents so "Modèle" and "Modele" collide rather than
    // producing two keys that read identically in a list.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_KEY_LENGTH)
    .replace(/_+$/g, '');
}

// ---------------------------------------------------------------------------
// Field-level cleaning
// ---------------------------------------------------------------------------

function cleanLabel(raw: unknown): Validated<string> {
  if (typeof raw !== 'string') return { ok: false, error: 'A name is required.' };
  const label = raw.trim().replace(/\s+/g, ' ');
  if (!label) return { ok: false, error: 'A name is required.' };
  if (label.length > MAX_LABEL_LENGTH) {
    return { ok: false, error: `Keep the name to ${MAX_LABEL_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: label };
}

function cleanDescription(raw: unknown): Validated<string | null> {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: 'The note must be text.' };
  const description = raw.trim();
  if (!description) return { ok: true, value: null };
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: `Keep the note to ${MAX_DESCRIPTION_LENGTH} characters or fewer.` };
  }
  return { ok: true, value: description };
}

function cleanSortOrder(raw: unknown, fallback: number): Validated<number> {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: fallback };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < MIN_SORT_ORDER || n > MAX_SORT_ORDER) {
    return {
      ok: false,
      error: `Position must be a whole number between ${MIN_SORT_ORDER} and ${MAX_SORT_ORDER}.`,
    };
  }
  return { ok: true, value: n };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/** Rule 2 lives here: the key is derived once, from the first label, and the
 *  caller never gets to choose it. `existingKeys` includes RETIRED rows on
 *  purpose — a retired source still owns its key, and the fix for "I want that
 *  name back" is to switch the old row on again, not to mint a twin. */
export function validateNewSource(
  input: NewSourceInput,
  existingKeys: readonly string[],
): Validated<NewSourceValue> {
  const label = cleanLabel(input.label);
  if (isInvalid(label)) return label;

  const key = slugifySourceKey(label.value);
  if (!key || !SOURCE_KEY_RE.test(key)) {
    return {
      ok: false,
      error: 'That name has no letters or numbers to build an identifier from. Use a plain-language name.',
    };
  }
  if (existingKeys.includes(key)) {
    return {
      ok: false,
      error: `A source with the identifier "${key}" already exists. If it was switched off, switch it back on rather than adding a second one.`,
    };
  }

  const description = cleanDescription(input.description);
  if (isInvalid(description)) return description;
  const sortOrder = cleanSortOrder(input.sort_order, DEFAULT_SORT_ORDER);
  if (isInvalid(sortOrder)) return sortOrder;

  return {
    ok: true,
    value: {
      key,
      label: label.value,
      description: description.value,
      sort_order: sortOrder.value,
      is_system: false,
      is_active: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

/** Rules 2 and 3 live here. A `key` in the patch is refused loudly rather than
 *  ignored quietly: a caller who thinks it renamed a source and did not would
 *  go on believing the wrong thing. */
export function validateSourceUpdate(
  current: OneMarkSourceRow,
  patch: SourcePatchInput & { key?: unknown },
): Validated<SourcePatchValue> {
  if (patch.key !== undefined && patch.key !== current.key) {
    return {
      ok: false,
      error: 'The identifier is fixed when a source is created — every question that came from it stores that identifier. Change the name instead.',
    };
  }

  const out: SourcePatchValue = {};

  if (patch.label !== undefined) {
    const label = cleanLabel(patch.label);
    if (isInvalid(label)) return label;
    out.label = label.value;
  }

  if (patch.description !== undefined) {
    const description = cleanDescription(patch.description);
    if (isInvalid(description)) return description;
    out.description = description.value;
  }

  if (patch.sort_order !== undefined) {
    const sortOrder = cleanSortOrder(patch.sort_order, current.sort_order);
    if (isInvalid(sortOrder)) return sortOrder;
    out.sort_order = sortOrder.value;
  }

  if (patch.is_active !== undefined) {
    if (typeof patch.is_active !== 'boolean') {
      return { ok: false, error: 'Switch the source on or off — nothing in between.' };
    }
    if (!patch.is_active && current.is_system) {
      return {
        ok: false,
        error: `"${current.label}" is one of the built-in sources. The ingestion job and the drafting job write it by name, so it cannot be switched off. Rename it if the wording is wrong.`,
      };
    }
    out.is_active = patch.is_active;
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'Nothing to change.' };
  }
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Reading the list
// ---------------------------------------------------------------------------

/** House order everywhere the list appears: position, then name. */
export function sortSources<T extends OneMarkSourceRow>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label) || a.key.localeCompare(b.key),
  );
}

/** What a PICKER may offer. Retired rows are hidden — except any key that is
 *  already chosen, which stays visible so a saved choice is never silently
 *  dropped out from under the person who made it (they can still untick it). */
export function pickerSources<T extends OneMarkSourceRow>(
  rows: readonly T[],
  selectedKeys: readonly string[] = [],
): T[] {
  const kept = new Set(selectedKeys);
  return sortSources(rows.filter((r) => r.is_active || kept.has(r.key)));
}

/** Turn whatever arrived in a request body into a clean key list.
 *  An empty list means EVERY source — the same idiom the paper wizard uses for
 *  an empty filter, so a learner who ticks nothing is not served nothing. */
export function normalizeSourceKeys(input: unknown, knownKeys: readonly string[]): string[] {
  if (!Array.isArray(input)) return [];
  const known = new Set(knownKeys);
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim();
    if (!key || !known.has(key) || out.includes(key)) continue;
    out.push(key);
  }
  // Ticking every source is the same request as ticking none, and saying so
  // here keeps `config.source_keys` honest for the analytics that reads it.
  if (out.length > 0 && out.length === known.size) return [];
  return out;
}

/** The name to show for a key. `null` is the questions whose origin was never
 *  recorded — a real bucket that is labelled, never dropped. */
export function sourceLabel(rows: readonly OneMarkSourceRow[], key: string | null | undefined): string {
  if (key === null || key === undefined || key === '') return UNRECORDED_SOURCE_LABEL;
  return rows.find((r) => r.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Counts
// ---------------------------------------------------------------------------

/** One question, as the count needs it. */
export interface CountableItem {
  source_key: string | null;
  is_active: boolean;
}

/** How many questions each source owns. The `null` bucket is counted under the
 *  empty string so the map has one key type; `withCounts` never reads it, but
 *  the analytics screen does. */
export function countsBySource(
  items: readonly CountableItem[],
): Map<string, { total: number; active: number }> {
  const out = new Map<string, { total: number; active: number }>();
  for (const it of items) {
    const key = it.source_key ?? '';
    const cur = out.get(key) ?? { total: 0, active: 0 };
    cur.total += 1;
    if (it.is_active) cur.active += 1;
    out.set(key, cur);
  }
  return out;
}

/** The management screen's rows: every source, in house order, with its counts.
 *  A source with no questions reports 0 rather than disappearing — an empty
 *  source is exactly what somebody needs to see before they retire it. */
export function withCounts(
  rows: readonly OneMarkSourceRow[],
  items: readonly CountableItem[],
): OneMarkSourceWithCounts[] {
  const counts = countsBySource(items);
  return sortSources(rows).map((r) => {
    const c = counts.get(r.key) ?? { total: 0, active: 0 };
    return { ...r, items_total: c.total, items_active: c.active };
  });
}

/** The questions whose origin was never recorded. Shown on the management
 *  screen as a plain sentence, because with 126 questions and no origin on any
 *  of them (production, 2026-09-07) it is the only honest headline there is. */
export function unrecordedCount(items: readonly CountableItem[]): { total: number; active: number } {
  return countsBySource(items).get('') ?? { total: 0, active: 0 };
}
