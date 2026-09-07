// OneMark review queue — what a draft must carry before it may go live.
//
// PURE. No 'use client', no 'use server', no imports from React or Supabase,
// so the SAME function runs in the card (to disable the Approve button and
// name what is missing) and in the server action (to refuse the write). The
// server run is the gate; the client run is a courtesy.
//
// Decision 7: one subject Senior Learner's tick flips is_active. This file is
// what that tick is allowed to flip — an item with no JABT level, no correct
// option or fewer than the board's four options must never reach a learner,
// whatever the client sent.

export const OPTION_KEYS = ['A', 'B', 'C', 'D'] as const;
export type OptionKey = (typeof OPTION_KEYS)[number];
export const BLOOM_LEVELS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6'] as const;
export type BloomLevel = (typeof BLOOM_LEVELS)[number];

/** The board prints four options — (a)–(d) in English, (அ)–(ஈ) in Tamil.
 *  English blueprint: PRD English §4.5 (`inline_4` = "all four options");
 *  Physics: PRD Physics §4.3. Both subjects, same count. */
export const OPTIONS_PER_ITEM = 4;

export type OneMarkSubject = 'tn_hsc_physics' | 'tn_hsc_english' | string;

export interface ApprovableOption {
  key: string;
  text: string;
}

/** The subset of a draft patch the approval rules read. */
export interface ApprovableDraft {
  stem: string;
  stem_ta: string | null;
  options: ApprovableOption[];
  answer: { correct: string | null; pending?: boolean } | null;
  bloom_level: string | null;
}

export type ApprovalBlocker =
  | 'an English stem'
  | 'all four English options'
  | 'the correct option'
  | 'a JABT level'
  | 'a Tamil stem';

/**
 * Returns the list of things still missing; an empty list means the draft
 * may be activated. Order is the order the reviewer reads the card.
 */
export function approvalBlockers(
  draft: ApprovableDraft,
  examKey: OneMarkSubject,
): ApprovalBlocker[] {
  const out: ApprovalBlocker[] = [];

  if (!draft.stem || !draft.stem.trim()) out.push('an English stem');

  // Four DISTINCT keys from A–D, each with text. A fifth option or a repeated
  // key is not "more than enough", it is a malformed item.
  const options = Array.isArray(draft.options) ? draft.options : [];
  const filled = new Map<string, string>();
  for (const o of options) {
    if (!o || typeof o !== 'object') continue;
    const key = String(o.key ?? '').toUpperCase();
    const text = String(o.text ?? '').trim();
    if ((OPTION_KEYS as readonly string[]).includes(key) && text && !filled.has(key)) {
      filled.set(key, text);
    }
  }
  if (filled.size < OPTIONS_PER_ITEM) out.push('all four English options');

  const correct = draft.answer?.correct ? String(draft.answer.correct).toUpperCase() : null;
  if (!correct || draft.answer?.pending === true || !filled.has(correct)) {
    out.push('the correct option');
  }

  if (!draft.bloom_level || !(BLOOM_LEVELS as readonly string[]).includes(draft.bloom_level)) {
    out.push('a JABT level');
  }

  // Decision 5: each person picks English or Tamil, so a Physics item cannot go
  // live without its Tamil block. English items are English-only by design.
  if (examKey === 'tn_hsc_physics' && !(draft.stem_ta ?? '').trim()) out.push('a Tamil stem');

  return out;
}

/** Same normalisation as scripts/onemark/ingest-board-paper.ts `normalise`
 *  (PRD B.3): NFC, underline markers removed, lowercase, punctuation → space,
 *  whitespace collapsed. Kept in step by hand — the script cannot be imported
 *  into the browser bundle (node:crypto). The queue uses this to show a
 *  reviewer which live or draft item shares a stem with the one in front of
 *  them (a stem-only collision is FLAGGED, not skipped — PRD English B.3). */
const UNDERLINE_MARKERS = /<\/?u>|__|(?<=\s|^)_(?=\S)|(?<=\S)_(?=\s|$|[.,;:!?])/g;

export function normaliseStem(text: string): string {
  return (text ?? '')
    .normalize('NFC')
    .replace(UNDERLINE_MARKERS, '')
    .toLowerCase()
    .replace(/\p{P}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
