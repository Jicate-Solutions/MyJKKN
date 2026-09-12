// File: lib/onemark/assets/approval.ts
//
// OneMark Wave 3 Lane D — the alt-text rule, in one pure function.
//
// Ruling #4: "any holder of foundation.items.manage may attach a picture and
// the approver still ticks the item; alt text is MANDATORY and the review
// queue must refuse to approve an item whose image lacks it."
//
// PURE, deliberately — no React, no Supabase, no 'use server' — so the same
// function runs in three places:
//   • the attach panel, to disable Save and say what is missing;
//   • POST/PATCH /api/foundation/onemark/assets, which is the real gate: an
//     asset row cannot be written or edited without alt text, so the condition
//     "an approved item has a picture with no alt text" is unreachable through
//     the application;
//   • the review queue's approval path, which composes
//     `assetApprovalBlockers()` into `approvalBlockers()`. That file
//     (`review/_lib/approve-rules.ts`) belongs to another lane, so this lane
//     ships the rule and the panel's live check; see the PR body.
//
// Shape of the blocker string matches approve-rules.ts: it completes the
// sentence "This draft still needs …".

import { ONEMARK_ALT_TEXT_MAX_LENGTH, ONEMARK_ALT_TEXT_MIN_LENGTH } from './constants';

/** The subset of an onemark_question_assets row this rule reads. */
export interface AssetForApproval {
  id?: string;
  asset_type?: string | null;
  storage_path?: string | null;
  alt_text?: string | null;
}

export const ALT_TEXT_BLOCKER = 'a description of every attached picture';

/**
 * Empty list = these pictures do not stand in the way of approval.
 *
 * A `katex_block` row carries no image and no storage path — it is notation,
 * already readable — so it is not asked for alt text.
 */
export function assetApprovalBlockers(assets: AssetForApproval[] | null | undefined): string[] {
  const rows = Array.isArray(assets) ? assets : [];
  const needsAlt = rows.filter((a) => {
    if ((a?.asset_type ?? '') === 'katex_block') return false;
    if (!a?.storage_path) return false;
    return !isUsableAltText(a.alt_text);
  });
  return needsAlt.length > 0 ? [ALT_TEXT_BLOCKER] : [];
}

/** Alt text good enough to stand in for the picture. */
export function isUsableAltText(value: string | null | undefined): boolean {
  const t = (value ?? '').trim();
  return t.length >= ONEMARK_ALT_TEXT_MIN_LENGTH && t.length <= ONEMARK_ALT_TEXT_MAX_LENGTH;
}

/** The sentence a route or a form shows when alt text will not do. Null when
 *  the text is fine. */
export function altTextProblem(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  if (t.length === 0) {
    return 'Describe the picture in a sentence — a learner using a screen reader, and the printed paper, both read this instead of the image.';
  }
  if (t.length < ONEMARK_ALT_TEXT_MIN_LENGTH) {
    return `That description is too short — write at least ${ONEMARK_ALT_TEXT_MIN_LENGTH} characters saying what the picture shows.`;
  }
  if (t.length > ONEMARK_ALT_TEXT_MAX_LENGTH) {
    return `That description is longer than ${ONEMARK_ALT_TEXT_MAX_LENGTH} characters — shorten it to what a reader needs.`;
  }
  return null;
}
