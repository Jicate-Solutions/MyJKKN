// File: lib/services/onemark/sources-board-paper.ts
//
// OneMark — "this bank question appeared in the real board paper".
//
// The other half of Director ruling (a) of 2026-09-06. Once a year, after the
// real exam, a question author reads the actual paper next to the bank and ticks
// what turned up: EXACT (the identical question) or NEAR (the same idea asked in
// different words). Those ticks are the only evidence the hit rate ever has.
//
// Append-only by design (Lane S3 item 8): a tick is DELETED by its author, never
// edited. Editing would let a row be nudged until it agreed with a story; a
// delete-and-retick leaves the same audit trail an honest correction should.
//
// Pure functions only. Unit-tested in
// __tests__/onemark/sources-board-paper.test.ts.

/** A tick, as `onemark_board_paper_hits` stores it. */
export interface BoardPaperHit {
  id: string;
  exam_definition_id: string;
  exam_year: number;
  /** March / June / September. null when the year had one sitting. */
  sitting: string | null;
  item_id: string;
  match_kind: BoardMatchKind;
  board_qno: number | null;
  note: string | null;
  noted_by: string | null;
  noted_at: string;
}

export type BoardMatchKind = 'exact' | 'near';

export const BOARD_MATCH_KINDS: readonly BoardMatchKind[] = ['exact', 'near'] as const;

export const BOARD_MATCH_LABELS: Record<BoardMatchKind, string> = {
  exact: 'Exact — the same question',
  near: 'Near — the same idea, different words',
};

/** The board has run every year since well before the bank existed; a year
 *  outside this window is a typing slip, not a record. */
export const MIN_EXAM_YEAR = 2000;
export const MAX_EXAM_YEAR_LOOKAHEAD = 1;
export const MAX_BOARD_QNO = 500;
export const MAX_SITTING_LENGTH = 40;
export const MAX_NOTE_LENGTH = 500;
/** Below this, a search would return most of the bank and help nobody. */
export const MIN_SEARCH_LENGTH = 3;

export type { Validated, Invalid, Valid } from './sources-service';
export { isInvalid } from './sources-service';
import type { Validated } from './sources-service';

export interface NewHitInput {
  exam_definition_id?: unknown;
  exam_year?: unknown;
  sitting?: unknown;
  item_id?: unknown;
  match_kind?: unknown;
  board_qno?: unknown;
  note?: unknown;
}

export interface NewHitValue {
  exam_definition_id: string;
  exam_year: number;
  sitting: string | null;
  item_id: string;
  match_kind: BoardMatchKind;
  board_qno: number | null;
  note: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** A sitting is free text on the board's own terms ("March", "June Supplementary").
 *  Empty and whitespace both mean "the year had one sitting", which is a real
 *  answer and the reason the unique index coalesces null to ''. */
export function normalizeSitting(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  return s === '' ? null : s.slice(0, MAX_SITTING_LENGTH);
}

/** Validate a tick before it is written. `currentYear` is passed in rather than
 *  read from the clock so the rule is testable and so a server and a browser
 *  never disagree about what "next year" means. */
export function validateNewHit(input: NewHitInput, currentYear: number): Validated<NewHitValue> {
  if (!isUuid(input.exam_definition_id)) {
    return { ok: false, error: 'Choose a subject.' };
  }
  if (!isUuid(input.item_id)) {
    return { ok: false, error: 'Choose the bank question that appeared.' };
  }

  const year = typeof input.exam_year === 'number' ? input.exam_year : Number(input.exam_year);
  const maxYear = currentYear + MAX_EXAM_YEAR_LOOKAHEAD;
  if (!Number.isInteger(year) || year < MIN_EXAM_YEAR || year > maxYear) {
    return { ok: false, error: `Board year must be a whole year between ${MIN_EXAM_YEAR} and ${maxYear}.` };
  }

  const matchKind = input.match_kind;
  if (typeof matchKind !== 'string' || !(BOARD_MATCH_KINDS as readonly string[]).includes(matchKind)) {
    return { ok: false, error: 'Say whether it was an exact match or a near match.' };
  }

  let boardQno: number | null = null;
  if (input.board_qno !== null && input.board_qno !== undefined && input.board_qno !== '') {
    const n = typeof input.board_qno === 'number' ? input.board_qno : Number(input.board_qno);
    if (!Number.isInteger(n) || n < 1 || n > MAX_BOARD_QNO) {
      return { ok: false, error: `Question number must be a whole number between 1 and ${MAX_BOARD_QNO}.` };
    }
    boardQno = n;
  }

  let note: string | null = null;
  if (typeof input.note === 'string' && input.note.trim() !== '') {
    note = input.note.trim();
    if (note.length > MAX_NOTE_LENGTH) {
      return { ok: false, error: `Keep the note to ${MAX_NOTE_LENGTH} characters or fewer.` };
    }
  }

  return {
    ok: true,
    value: {
      exam_definition_id: input.exam_definition_id,
      exam_year: year,
      sitting: normalizeSitting(input.sitting),
      item_id: input.item_id,
      match_kind: matchKind as BoardMatchKind,
      board_qno: boardQno,
      note,
    },
  };
}

/** The database's own uniqueness rule, mirrored so the screen can grey a
 *  question out instead of letting somebody click into a constraint error.
 *  One tick per (question, year, sitting) — coalescing null exactly as the
 *  expression index does. */
export function hitCollisionKey(input: {
  item_id: string;
  exam_year: number;
  sitting: string | null;
}): string {
  return `${input.item_id}|${input.exam_year}|${input.sitting ?? ''}`;
}

export function alreadyTicked(
  existing: readonly BoardPaperHit[],
  candidate: { item_id: string; exam_year: number; sitting: string | null },
): BoardPaperHit | null {
  const key = hitCollisionKey(candidate);
  return existing.find((h) => hitCollisionKey(h) === key) ?? null;
}

/** Only the author may remove their own tick. Append-only means a correction is
 *  visible as a removal by the person who made the claim, never as a quiet edit
 *  by somebody else. A holder of the item-manage permission who did not make
 *  the tick is refused here, deliberately. */
export function canRemoveHit(hit: BoardPaperHit, userId: string): boolean {
  return hit.noted_by !== null && hit.noted_by === userId;
}

/** The search term, cleaned. Returns null when it is too short to run — the
 *  screen says so rather than returning the whole bank. */
export function normalizeSearch(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.trim().replace(/\s+/g, ' ');
  if (q.length < MIN_SEARCH_LENGTH) return null;
  // PostgREST `ilike` treats % and _ as wildcards and , as a filter separator.
  return q.replace(/[%_,]/g, ' ').trim() || null;
}

/** How a question reads in the tick list: enough to recognise it, never its
 *  answer. The board paper is the thing being compared — the key is not needed
 *  and is not fetched. */
export interface TaggableQuestion {
  id: string;
  stem: string;
  source_key: string | null;
  source_year: number | null;
  is_active: boolean;
}

export function questionPreview(stem: string, max = 160): string {
  const s = String(stem ?? '').replace(/\s+/g, ' ').trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Group ticks by question, so a screen can show "already ticked for 2024" next
 *  to each row without a lookup per row. */
export function hitsByItem(hits: readonly BoardPaperHit[]): Map<string, BoardPaperHit[]> {
  const out = new Map<string, BoardPaperHit[]>();
  for (const h of hits) {
    const cur = out.get(h.item_id) ?? [];
    cur.push(h);
    out.set(h.item_id, cur);
  }
  return out;
}

/** The tick, in one line, for the list and for a confirmation toast. */
export function describeHit(hit: BoardPaperHit): string {
  const bits = [
    String(hit.exam_year),
    hit.sitting ?? null,
    hit.board_qno != null ? `Q${hit.board_qno}` : null,
    hit.match_kind === 'exact' ? 'exact' : 'near',
  ].filter(Boolean);
  return bits.join(' · ');
}
