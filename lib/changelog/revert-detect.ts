// What's New — did this change UNDO an earlier one?
//
// Director ruling 6 (2026-09-13, specs/whats-new/highlight-writer-rulings-2026-09-13.md):
// "If a change is later undone, its write-up comes down automatically. Nobody
// should be told to go try something that no longer exists." He accepted, in
// the same breath, that not every revert is detectable and that some will slip
// through — so this file's job is to be HONEST about which shape it catches
// rather than to appear thorough.
//
// ── WHAT IT CAN SEE
// `git revert` writes a subject of exactly `Revert "<the original subject>"`.
// That is the only machine-guaranteed shape in the whole revert story, and it
// is the one shape that survives into changelog_entries, because the sync
// stores the SUBJECT line and nothing else.
//
// ── WHAT IT CANNOT SEE, STATED PLAINLY
//   • A hand-written undo. "fix: put the old behaviour back" reverts a feature
//     and looks like any other fix. Undetectable here, and undetectable by any
//     rule short of reading the diff.
//   • `This reverts commit <sha>` in the commit BODY. That line is the reliable
//     machine signal — but changelog_entries has no body column, only `subject`
//     (20260906090000_changelog_live_data.sql). Matching on it would mean
//     widening the sync, and scripts/sync-changelog-db.mjs is owned by another
//     lane right now.
//   • A revert whose subject was reworded on the way in (a squash-merge title
//     typed by a person, a "Revert: x" colon form, a translated subject).
//   • A feature removed by a later redesign rather than by a revert.
//   • A revert landing in a DIFFERENT application's repository from the change
//     it undoes. Matching is scoped to one app_key, because a subject line is
//     only unique inside one repository — the same lesson
//     20260907183500_changelog_entries_key_by_app_and_sha.sql records for shas.
//
// ── RE-LANDS ARE NOT REVERTS, AND THAT IS THE SUBTLE ONE
// `Revert "Revert "feat: X""` is a RE-LAND: the feature is back. Matching one
// level of quoting would read that as an undo of `Revert "feat: X"` and, worse,
// a naive matcher that just strips the first prefix would retract the write-up
// for the feature that has just returned. So depth is counted and only ODD
// depth is an undo — the same parity rule a person applies by eye.
//
// Pure, no I/O, no clock. The caller does the database work.

/** The trailing squash-merge pull-request marker: `feat: thing (#3712)`. */
const PR_SUFFIX = /\s*\(#\d+\)\s*$/;

/**
 * One layer of `Revert "..."`, with an optional pull-request suffix outside the
 * quotes (GitHub appends it when the revert is squash-merged).
 *
 * Anchored at both ends and greedy inside the quotes so a subject that itself
 * contains a quote character still peels correctly: the LAST closing quote is
 * the one that closes the revert, not the first.
 */
const REVERT_LAYER = /^Revert\s+"(.*)"\s*(?:\(#\d+\))?\s*$/;

/**
 * The subject this one undoes — or null when it undoes nothing we can see.
 *
 * Returns the innermost original subject at ODD quoting depth (a revert), and
 * null at even depth (a re-land) and for every shape listed in the header.
 */
export function revertedSubject(subject: string): string | null {
  if (typeof subject !== 'string') return null;

  let current = subject.trim();
  let depth = 0;

  // Bounded: each pass must strip a whole `Revert "..."` layer or the loop
  // ends, so this cannot spin on a pathological subject.
  for (;;) {
    const m = REVERT_LAYER.exec(current);
    if (!m) break;
    current = m[1].trim();
    depth++;
  }

  if (depth === 0) return null;
  // Even depth is a re-land: the change is back on the branch, so its write-up
  // must NOT be taken down.
  if (depth % 2 === 0) return null;
  if (current === '') return null;
  return current;
}

/**
 * The form two subjects are compared in.
 *
 * A revert carries the original subject verbatim EXCEPT that the original may
 * have picked up its own `(#1234)` on the way in while the quoted copy did not,
 * or vice versa. Dropping that one suffix from both sides is the only latitude
 * taken here — everything else is compared exactly, because a loose match would
 * take down a write-up for a change nobody reverted, which is a worse failure
 * than missing one the Director already accepted will be missed.
 */
export function revertMatchKey(subject: string): string {
  return String(subject ?? '').trim().replace(PR_SUFFIX, '').trim();
}

/** One entry, in the only two fields this matching needs. */
export interface RevertCandidate {
  sha: string;
  app_key: string;
  subject: string;
}

/** A write-up that must come down, and the change that undid it. */
export interface Retraction {
  /** the entry whose write-up is retracted */
  app_key: string;
  sha: string;
  /** the sha of the commit that reverted it */
  reverted_by: string;
  /** the reverting commit's own subject, for the audit line */
  reverted_by_subject: string;
}

/**
 * Which of `written` were undone by something in `entries`.
 *
 * `written` is the set of entries that currently carry a write-up on the page;
 * `entries` is every entry in the window, reverts included. Both are matched
 * inside one app_key.
 *
 * A revert only retracts a change that came BEFORE it. Without that guard a
 * revert would also match a later re-application that happens to carry the same
 * subject, and would take down the write-up for the change that is live.
 */
export function findRetractions(
  entries: ReadonlyArray<RevertCandidate & { entry_date: string }>,
  written: ReadonlyArray<RevertCandidate & { entry_date: string }>
): Retraction[] {
  const out: Retraction[] = [];
  const seen = new Set<string>();

  for (const e of entries) {
    const undone = revertedSubject(e.subject);
    if (!undone) continue;
    const key = revertMatchKey(undone);
    if (key === '') continue;

    for (const w of written) {
      if (w.app_key !== e.app_key) continue;
      if (w.sha === e.sha) continue;
      if (revertMatchKey(w.subject) !== key) continue;
      // Strictly earlier by date. Same-day is allowed: a revert landing on the
      // day of the change it undoes is the commonest revert there is, and
      // changelog_entries carries a DATE, not a timestamp, so a stricter test
      // would miss most real reverts.
      if (w.entry_date > e.entry_date) continue;

      const id = `${w.app_key}:${w.sha}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        app_key: w.app_key,
        sha: w.sha,
        reverted_by: e.sha,
        reverted_by_subject: e.subject,
      });
    }
  }

  return out;
}
