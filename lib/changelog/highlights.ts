// What's New — weekly highlights: the types, and the DETERMINISTIC selection
// that decides which of a week's changes are offered for a write-up.
//
// WHY SELECTION IS CODE AND THE WRITING IS NOT. 222 user-facing commits landed
// in the seven days to 2026-09-12. Nobody is hand-picking ten of those every
// week, so the picking has to be automatic. But the Director rejected "AI
// rewrites everything, nobody checks" on accuracy grounds — on a page people
// trust to learn the system, a confident wrong claim is worse than a terse
// accurate one. So the split is: the machine SELECTS, a person WRITES and
// APPROVES. Nothing here invents a sentence about a change.
//
// Every rule below reads only fields that are already in the row — kind,
// module, breaking flag, pull-request number. There is no model call, no
// network, no clock beyond the week boundary the caller passes in. Run it twice
// on the same input and it returns the same list in the same order, which is
// what makes `selection_reason` worth storing and the queue worth auditing.

import type { ChangelogEntry, ChangelogModule } from './types';

/** A highlight row as the page and the approval screen read it. */
export interface Highlight {
  /** the entry this writes up — (app_key, sha) is the key it joins on */
  app_key: string;
  sha: string;
  headline: string | null;
  affects: string | null;
  action: string | null;
  status: HighlightStatus;
  selection_reason: string | null;
}

export type HighlightStatus = 'draft' | 'approved' | 'skipped';

/** One entry selection is offering, with the sentence saying why. */
export interface HighlightCandidate {
  entry: ChangelogEntry;
  /** the score the rules gave it — shown to the approver so the order is legible */
  score: number;
  /** one sentence, in the reader's words, explaining the pick */
  reason: string;
  /** a deterministic first guess at "who it affects", from the module alone */
  suggestedAffects: string;
}

/**
 * The most write-ups one week is allowed to carry.
 *
 * The Director's number was "the ~10 changes that actually affect" the people
 * who use MyJKKN. It is a cap on the APPROVER'S QUEUE, not on the strip: a week
 * where only three are worth approving shows three.
 */
export const WEEKLY_CAP = 10;

/**
 * Kinds worth a write-up, and what each is worth.
 *
 * 'faster' is absent on purpose. A performance change is real work and stays in
 * the plain list, but it answers "what changed" and never "what can I now do" —
 * which is the question the Director asked this strip to answer. Promoting one
 * would push out a change that does answer it.
 */
const KIND_SCORE: Record<string, number> = {
  security: 100,
  new: 80,
  fixed: 50,
};

/** A change that breaks something the reader already does is the one they most need told. */
const BREAKING_BONUS = 40;

/** A change that went through a pull request was reviewed by a second person. */
const REVIEWED_BONUS = 10;

/** A module with a screen the reader can open is a module they can act in. */
const OPENABLE_BONUS = 5;

/**
 * Can a person actually go and look at this?
 *
 * A module is offered when it has somewhere to send the reader (`href`), or
 * when it is platform-wide (`perm === null` — sign-in, navigation, speed),
 * which everyone signed in already sees. A module with neither is one nobody
 * can open and nobody is scoped to, so "what you can do now" has no answer.
 */
function isReachable(mod: ChangelogModule | undefined): boolean {
  if (!mod) return false;
  return mod.href !== null || mod.perm === null;
}

/** "Everyone" for a platform-wide change; otherwise the area's own name. */
function affectsFromModule(mod: ChangelogModule | undefined): string {
  if (!mod) return 'Everyone signed in.';
  if (mod.perm === null) return 'Everyone signed in.';
  return `Anyone who works in ${mod.label}.`;
}

/**
 * The sentence the approver reads before deciding.
 *
 * Built only from facts already on the row, in the order they carried weight,
 * so that "why is this in my queue" is answerable without opening the code.
 */
function reasonFor(entry: ChangelogEntry, mod: ChangelogModule | undefined, score: number): string {
  const area = mod?.label ?? entry.m;
  const kindPhrase =
    entry.t === 'security'
      ? 'a security change'
      : entry.t === 'new'
        ? 'something new'
        : 'a fix';
  const parts = [`Picked because it is ${kindPhrase} in ${area}`];
  if (entry.b === 1) parts.push('it changes how something already works');
  if (entry.p) parts.push(`it went through pull request #${entry.p}`);
  return `${parts.join(', and ')}. Score ${score}.`;
}

/**
 * Monday of the week a YYYY-MM-DD date falls in.
 *
 * Entry dates are each commit's own +05:30 date (`git log %cd`), so they are
 * already IST calendar days and need no conversion — doing the arithmetic in
 * UTC on a bare Y-M-D is what keeps this from sliding by one at a timezone
 * boundary, the same seam that once made a single day render in both halves of
 * this page.
 */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d));
  // getUTCDay(): Sunday is 0. Shift so Monday is 0 and Sunday is 6.
  const offset = (at.getUTCDay() + 6) % 7;
  at.setUTCDate(at.getUTCDate() - offset);
  return at.toISOString().slice(0, 10);
}

/**
 * The candidates for one week, best first, capped.
 *
 * `entries` is expected NEWEST FIRST — the total order
 * app/api/whats-new/route.ts serves (entry_date desc, ordinal asc, app_key asc,
 * sha desc). The sort below is stable, so entries that tie on score keep that
 * order, which is what makes the whole result reproducible rather than merely
 * deterministic-in-principle.
 *
 * `alreadyDecided` are the (app_key, sha) keys a person has already approved or
 * skipped. They are removed rather than re-offered: a skipped entry that came
 * back every week would train the approver to stop reading the queue.
 */
export function selectHighlights(
  entries: ChangelogEntry[],
  modules: Record<string, ChangelogModule>,
  options: {
    /** inclusive YYYY-MM-DD lower bound — normally weekStart(today) */
    from: string;
    /** exclusive YYYY-MM-DD upper bound; omit for "up to and including today" */
    until?: string;
    alreadyDecided?: ReadonlySet<string>;
    cap?: number;
  }
): HighlightCandidate[] {
  const { from, until, alreadyDecided, cap = WEEKLY_CAP } = options;

  const scored: HighlightCandidate[] = [];
  for (const entry of entries) {
    if (entry.d < from) continue;
    if (until && entry.d >= until) continue;
    if (alreadyDecided?.has(entry.h)) continue;

    const base = KIND_SCORE[entry.t];
    if (base === undefined) continue;

    const mod = modules[entry.m];
    if (!isReachable(mod)) continue;

    let score = base;
    if (entry.b === 1) score += BREAKING_BONUS;
    if (entry.p) score += REVIEWED_BONUS;
    if (mod?.href) score += OPENABLE_BONUS;

    scored.push({
      entry,
      score,
      reason: reasonFor(entry, mod, score),
      suggestedAffects: affectsFromModule(mod),
    });
  }

  // Stable by construction: Array.prototype.sort is required to be stable, so
  // equal scores keep the newest-first order they arrived in.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, cap);
}
