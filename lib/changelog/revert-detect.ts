// What's New — the two reasons a published write-up comes down on its own.
//
// ── WHY THIS FILE WAS REWRITTEN (2026-09-14)
// It used to match reverts by TEXT, and specs/whats-new/KNOWN-GAP-revert-detection.md
// records, at length, that the result could never fire in production:
//
//   1. `git revert` writes `Revert "feat(x): …"`, which does not match the
//      generator's SUBJECT_RE, so a revert never became a changelog_entries row
//      at all. Measured on jicate/main 2026-09-14: five commits carry a
//      `Revert "…"` subject and not one of them could survive that filter.
//   2. The `subject` STORED on a row has had its `type(scope):` prefix stripped,
//      its `(#nnnn)` removed and its first letter upper-cased — so comparing it
//      against a revert's raw quoted subject could not succeed even if (1) were
//      lifted.
//   3. Worse than not firing: because the prefix is stripped, `feat(events):
//      send a reminder` and `fix(billing): send a reminder` STORE AS THE SAME
//      STRING. The moment (1) was lifted, one revert would have taken down an
//      unrelated module's write-up. The Director's stated bias is that a false
//      retraction is the worse failure, so text matching is gone rather than
//      guarded: nothing in this file compares a subject any more.
//
// The revert graph is now resolved ONCE, at read time, in
// scripts/generate-changelog.mjs — against raw git output, where a subject
// still has its prefix and can be resolved to a single commit — and the answer
// is written to changelog_entries.reverted_by_sha. This file only reads that
// column. Matching is by SHA, which is unique inside one repository, which is
// the same key the row itself is keyed by.
//
// ── THE SECOND REASON: THREE READERS SAID IT IS WRONG
// Director ruling (2026-09-13, 22:20): three distinct readers flagging a
// write-up should take it down automatically, and a super admin can restore it.
// changelog_highlight_reports is a tally with one row per (write-up, reader),
// so the count is by construction the number of DISTINCT readers.
//
// ── WHY BOTH TAKEDOWNS RECORD A QUERYABLE REASON
// Both land on status = 'skipped', which is also what a person's "hide this"
// and the writer's own "no user-visible effect" refusal land on. Before
// skip_reason existed, the four were distinguishable only by prose inside
// selection_reason, which is not queryable — so a super admin could not find
// the machine takedowns to review, and ruling 5's never-rewrite check (which
// keys on status alone) made a restored write-up permanently unwritable with no
// way to tell why. skip_reason is that missing column.
//
// Pure, no I/O, no clock. The caller does the database work.

/** Why a published write-up came down. Mirrors the CHECK on
 *  changelog_highlights.skip_reason — keep the two in step. */
export type SkipReason = 'reverted' | 'reported' | 'person' | 'ai_refused';

/** A write-up that must come down, and why. */
export interface Takedown {
  app_key: string;
  sha: string;
  reason: SkipReason;
  /** The sha of the commit that reverted it. Only for reason 'reverted'. */
  reverted_by?: string;
  /** How many distinct readers flagged it. Only for reason 'reported'. */
  reports?: number;
}

/** One entry, in the only fields these decisions need. */
export interface EntryRevertState {
  app_key: string;
  sha: string;
  /** changelog_entries.reverted_by_sha — NULL for all but a handful of rows. */
  reverted_by_sha?: string | null;
}

/** One published write-up, in the only fields these decisions need. */
export interface WrittenHighlight {
  app_key: string;
  sha: string;
  status: 'draft' | 'approved' | 'skipped';
  source: 'human' | 'ai';
  /** Set the moment a PERSON approves, skips or restores the row. */
  reviewed_at?: string | null;
}

/** Key a row by the pair it is actually keyed by. A bare sha is unique inside
 *  ONE repository and nowhere else — 20260907183500 records that lesson. */
function key(app_key: string, sha: string): string {
  return `${app_key}:${sha}`;
}

/**
 * Ruling 6 — the write-ups whose change is not on the branch any more.
 *
 * "Nobody should be told to go try something that no longer exists." A reverted
 * feature leaves a card saying where to click and what the reader can now do,
 * and that is worse than no card: they go looking, find nothing, and stop
 * trusting the page.
 *
 * ONLY 'approved' ROWS. A draft renders nowhere and a skipped one is already
 * down, so touching either would be noise in the audit trail for no change on
 * the page.
 *
 * A HUMAN-WRITTEN WRITE-UP IS RETRACTED TOO, unlike the report takedown below,
 * and that asymmetry is deliberate. A revert is an objective fact about the
 * branch — the thing the card points at is gone whoever wrote the card. A
 * report is three readers' opinion, and a person who has already looked at the
 * row has outranked them.
 *
 * WHAT IS STILL INVISIBLE, STATED PLAINLY. A hand-written undo ("fix: put the
 * old behaviour back") reverts a feature and looks like any other fix; a
 * feature removed by a later redesign is not a revert at all. Neither carries
 * `This reverts commit <sha>` nor a `Revert "…"` subject, so neither reaches
 * this column. The Director was shown that gap and accepted it.
 */
export function findRevertTakedowns(
  entries: ReadonlyArray<EntryRevertState>,
  written: ReadonlyArray<WrittenHighlight>
): Takedown[] {
  const approved = new Map<string, WrittenHighlight>();
  for (const w of written) {
    if (w.status !== 'approved') continue;
    approved.set(key(w.app_key, w.sha), w);
  }

  const out: Takedown[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const by = e.reverted_by_sha;
    if (!by) continue;
    // A commit cannot revert itself. Defensive rather than expected: the
    // generator already refuses that edge, and a row that claimed it would
    // otherwise retract a live write-up.
    if (by === e.sha) continue;
    const k = key(e.app_key, e.sha);
    if (!approved.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ app_key: e.app_key, sha: e.sha, reason: 'reverted', reverted_by: by });
  }
  return out;
}

/**
 * The write-ups that enough distinct readers have called wrong.
 *
 * `reports` is app_key+sha → how many DISTINCT readers flagged it. The UNIQUE
 * on changelog_highlight_reports (app_key, sha, reported_by) is what makes a
 * plain row count mean that, so the caller may count rows without de-duplicating.
 *
 * NEVER A ROW A PERSON HAS ALREADY LOOKED AT. `reviewed_at` is stamped the
 * moment a super admin approves, skips or RESTORES a row, so this rule cannot
 * undo a human decision — and, just as importantly, cannot fight one: without
 * that guard, restoring a write-up that still carries three reports would be
 * followed by the cron taking it down again on the next tick, every half hour,
 * for ever.
 *
 * The reports themselves are never deleted — the tally of how often the writing
 * was wrong must survive the fixing of any one instance of it.
 */
export function findReportTakedowns(
  written: ReadonlyArray<WrittenHighlight>,
  reports: ReadonlyMap<string, number>,
  threshold: number
): Takedown[] {
  // A threshold below 1 would take down every write-up that nobody reported.
  const min = Math.max(1, Math.floor(threshold));
  const out: Takedown[] = [];
  for (const w of written) {
    if (w.status !== 'approved') continue;
    if (w.reviewed_at) continue;
    const n = reports.get(key(w.app_key, w.sha)) ?? 0;
    if (n < min) continue;
    out.push({ app_key: w.app_key, sha: w.sha, reason: 'reported', reports: n });
  }
  return out;
}

/** The map key `findReportTakedowns` reads, so a caller counting rows does not
 *  have to know how the pair is spelled. */
export function reportKey(app_key: string, sha: string): string {
  return key(app_key, sha);
}
