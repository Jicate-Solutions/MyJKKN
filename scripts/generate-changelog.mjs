#!/usr/bin/env node
/**
 * Generates the MyJKKN "What's New" changelog from git history.
 *
 * Why git and not the GitHub API: the repo is private (since 2026-08-15), so an
 * API read needs a token at build time. Git history is already on disk and is
 * the same data. It also captures direct-to-main pushes, which the PR API does
 * NOT — 2,794 of our user-facing changes never went through a PR, and building
 * from PRs alone would credit 96% of MyJKKN to one person.
 *
 * Output: NOTHING on disk. It used to write lib/changelog/data/{recent,archive,
 * meta}.json and those files were committed; the entries now live in the
 * changelog_entries table (2026-09-06) and the page reads the database. Two
 * writers of one list drift, and only one of them is what people see, so the
 * files were deleted rather than left lying around regenerating.
 *
 * What is left is a LIBRARY plus a read-only CLI:
 *   collectChangelog()  — the parsing, imported by scripts/sync-changelog-db.mjs,
 *                         which is the only thing that writes the rows.
 *   npm run changelog   — prints what the rules currently produce. `--json`
 *                         prints the payload to stdout for local inspection.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { moduleFor, lookupModule } from '../lib/changelog/modules.mjs';
import { INTERNAL_SCOPES } from '../lib/changelog/modules.mjs';
import { entryHref } from '../lib/changelog/entry-link.mjs';
import {
  stripBugRefs,
  isInternalEngineering,
  isContentFree,
  redactIdentifiers,
} from '../lib/changelog/title-rules.mjs';

const REF = process.env.CHANGELOG_REF || 'jicate/main';
const US = '\x1f'; // field separator
const RS = '\x1e'; // record separator

/**
 * The clock every changelog date and time is read in.
 *
 * NOT the machine's. `git log --date=short` renders each commit in the
 * COMMITTER'S own offset, and 293 of this repository's 7,305 commits carry `Z`
 * rather than `+05:30` — they are GitHub's own merge commits, which GitHub
 * records in UTC. Under the old day-only format that was invisible. It stops
 * being invisible the moment a time is displayed: a merge GitHub stamped
 * 2026-09-10T20:30:00Z is 2:00 am on the 11th in IST, so the row would show a
 * time from a day the header above it does not name.
 *
 * Pinning the whole read to Asia/Kolkata makes the date and the time two
 * readings of ONE clock, so they cannot disagree by construction. It is also the
 * timezone every other boundary on this page is already drawn in — istDate() and
 * recentFrom() in app/api/whats-new/route.ts, after a bug that printed
 * "Updated 5 September" above an entry dated 6 September.
 *
 * Measured cost: 38 of 7,305 commits (0.52%) move to the following day, and
 * every one of them is a UTC-stamped merge that genuinely happened after IST
 * midnight. Those rows are corrected on the first sync after this ships.
 *
 * Set explicitly rather than inherited: GitHub Actions runs in UTC, so relying
 * on the ambient TZ would give CI and a developer's Mac different answers.
 */
const CHANGELOG_TZ = 'Asia/Kolkata';

/**
 * `iso-strict-local` = the committer date rendered in CHANGELOG_TZ, with that
 * zone's offset attached: `2026-09-12T19:40:00+05:30`. The first ten characters
 * are exactly what `--date=short` used to return for an IST committer, so `d`
 * keeps its meaning and its `date` column; the rest is the time we used to throw
 * away (Director, 2026-09-12: "can we also add time to the whatsnew so that we
 * know when the change happened").
 */
const GIT_DATE_FORMAT = '--date=iso-strict-local';

/** Environment for every git read here — see CHANGELOG_TZ. */
const GIT_ENV = { ...process.env, TZ: CHANGELOG_TZ };

// Types that describe a change a human would care about. Everything else
// (ci, chore, docs, test, refactor, wip, style) is scaffolding, not news.
const USER_FACING = { feat: 'new', fix: 'fixed', perf: 'faster', security: 'security' };

/**
 * Identity merges. ONLY where the same human provably used two git identities
 * (same person, different email/spelling). We do NOT invent names for machine
 * aliases like `trial2@local` — an unverifiable alias is shown as-is rather
 * than credited to someone who may not have written it.
 */
const IDENTITY = new Map([
  ['a.boobalzen003@gmail.com', 'Boobalan'],
  ['141622627+boobal003@users.noreply.github.com', 'Boobalan'],
  ['85791019+ommsharravana@users.noreply.github.com', 'Ommsharravana'],
  ['ommsharravana@users.noreply.github.com', 'Ommsharravana'],
  ['158258895+rojasundharam@users.noreply.github.com', 'Roja Sundharam'],
  ['sroja@jkkn.ac.in', 'Roja Sundharam'],
  ['93026365+viswanathan54@users.noreply.github.com', 'Viswanathan Shanmugam'],
  ['261557258+jananijkkn@users.noreply.github.com', 'Janani'],
  ['janani.jicate@jkkn.ac.in', 'Janani'],
  ['sangeetha_v@jkkn.ac.in', 'Sangeetha V'],
  ['kayalkayu2003@gmail.com', 'Kayalvizhi S'],
  ['deepakkumar@jkkn.ac.in', 'Deepak Kumar'],
  ['aiengineering@jkkn.ac.in', 'JKKN AI Engineering'],
  // trial2@local (198 entries, 1-22 Jul) and t@t (29 entries, 28-30 Jun) are not two
  // people: they are ONE workstation whose git user.name sat at a throwaway value for
  // 24 days. Evidence in artifacts/whats-new-attribution-forensics.html - the same
  // machine committed as 'JKKN AI Engineering' before that window and as 'sim' after
  // it, its commits share Claude Code sessions with director@jkkn.ac.in commits, and
  // all of them reached main through PRs opened by Ommsharravana. Both of the bracketing
  // identities already merge to JKKN AI Engineering here, so this is the same rule, not
  // a new guess. If that read is wrong, delete these two lines and the names come back.
]);

function author(name, email) {
  const e = (email || '').toLowerCase();
  if (IDENTITY.has(e)) return IDENTITY.get(e);
  // director@jkkn.ac.in is shared by the Director and the AI engineering fleet;
  // the committer NAME is what disambiguates them, so trust it here.
  if (e === 'director@jkkn.ac.in') return name === 'Ommsharravana' ? 'Ommsharravana' : 'JKKN AI Engineering';
  // Fleet sessions sign as `sim` from an @jkkn.ac.in account — org-verifiable.
  if (name === 'sim' && e.endsWith('@jkkn.ac.in')) return 'JKKN AI Engineering';
  // `trial2` (198 entries, 1-22 Jul) and `t` (29 entries, 28-30 Jun) are not two
  // people: one workstation whose git user.name sat at a throwaway value for 24
  // days. Evidence in artifacts/whats-new-attribution-forensics.html — the same
  // machine committed as 'JKKN AI Engineering' before that window and as 'sim'
  // after it, its commits share Claude Code sessions with director@jkkn.ac.in
  // commits, and all reached main through PRs opened by Ommsharravana. Matched on
  // NAME, not email, because the alias ran under five addresses — trial2@local
  // plus aieee@, director@, aimech@ and aicse@jkkn.ac.in — and four of those being
  // fleet accounts is itself part of the evidence. Both bracketing identities
  // already merge to JKKN AI Engineering here, so this is the same rule, not a new
  // guess. If that read is wrong, delete these two lines and the names come back.
  if (name === 'trial2' || name === 't') return 'JKKN AI Engineering';
  return name;
}

/**
 * Derive a module from the files a commit touched.
 *
 * ~230 commits carry no scope at all, and an unscoped commit fell into
 * "Platform", which everyone signed in can read. That was wrong in both
 * directions: it buried Campus Living news in a generic bucket, and it put
 * lines like "Add super_admin secret-rotation UI page" on a student's screen.
 * The changed paths say which module a commit really belongs to, so use them
 * whenever the scope is missing or unrecognised.
 */
const PATH_RE = [
  /^app\/\(routes\)\/([a-z0-9-]+)/,
  /^app\/api\/([a-z0-9-]+)/,
  /^app\/\(parent-portal\)\/([a-z0-9-]+)/,
  /^components\/([a-z0-9-]+)/,
  /^lib\/services\/([a-z0-9-]+)/,
  // lib/utils/<module>/… must be tried BEFORE the generic lib/ rule below,
  // which would capture "utils" and stop looking. 22 entries were stuck in
  // Platform for exactly this reason: an unscoped run of BOS attendance
  // certificate tweaks, all of them in lib/utils/internal-marks/.
  /^lib\/utils\/([a-z0-9-]+)\//,
  /^lib\/([a-z0-9-]+)/,
  /^hooks\/([a-z0-9-]+)/,
  // Last resort: a page that lives directly under app/ rather than in the
  // (routes) group — e.g. app/admin/whatsapp-byow/secret-rotation/page.tsx.
  // The parenthesised route groups cannot match this pattern, so it is safe
  // to try only after the specific rules above.
  /^app\/([a-z0-9-]+)/,
];

/**
 * Exact path prefixes whose owning module the regexes above cannot see, because
 * the module name is baked into a FILE name rather than a directory. Each line
 * is here because it was observed stranding real entries in Platform; the count
 * is what it recovers today. Consulted before PATH_RE, in listed order.
 *
 * No hint may name a path under an INFRA_PREFIX. A hint makes the commit look
 * "recovered", which skips the all-infra check below — hinting
 * scripts/batch-autofill-school-learners.ts pulled three "Correct column names
 * in batch autofill script" commits back onto the page, so it was removed.
 */
const PATH_HINTS = [
  // "enforce school defaults in updateLearnerProfile", "integrate
  // SchoolDefaultsService into LearnerProfileService" — the May-2026 K-12
  // auto-fill run, 7 entries, all of it learner-profile work.
  ['lib/services/school-defaults', 'learners'],
  ['lib/services/learner-profile', 'learners'],
  // "bos examiner pdf alignment fix" — one file, lib/pdf/bos-meeting-notice.ts.
  ['lib/pdf/bos-', 'bos'],
  // Instagram polling lives in cron routes and a root-level service file, so
  // neither the scope (`api/cron`, `services/instagram`, `ig-ι`) nor a
  // directory rule reaches it. 5 entries, all Social.
  ['services/instagram', 'instagram'],
  ['app/api/cron/instagram', 'instagram'],
  ['app/api/cron/ig-', 'instagram'],
  // "Add WhatsApp auto-reply + scheduled messages" — unscoped, one cron route.
  ['app/api/cron/process-scheduled-whatsapp', 'whatsapp'],
];

/**
 * Paths that are never a user-visible change on their own. A commit touching
 * ONLY these is engineering upkeep — a CI script, a doc, a migration file —
 * and it was landing in the everyone-can-read bucket with a title that reads
 * like a feature ("Add super_admin secret-rotation UI page" turned out to be a
 * one-line edit to a reachability script).
 */
const INFRA_PREFIX = [
  'scripts/', '.github/', 'docs/', 'supabase/', '.claude/', 'tests/',
  '__tests__/', 'e2e/', 'specs/', 'artifacts/', '.screenshots/', 'design-system/',
];

function isAllInfra(files) {
  return files.length > 0 && files.every((f) => INFRA_PREFIX.some((p) => f.startsWith(p)));
}

function scopeFromFiles(files) {
  const tally = new Map();
  for (const f of files) {
    const hint = PATH_HINTS.find(([prefix]) => f.startsWith(prefix));
    if (hint) {
      tally.set(hint[1], (tally.get(hint[1]) ?? 0) + 1);
      continue;
    }
    for (const re of PATH_RE) {
      const m = f.match(re);
      if (!m) continue;
      const seg = m[1].toLowerCase();
      if (lookupModule(seg)) tally.set(seg, (tally.get(seg) ?? 0) + 1);
      break;
    }
  }
  if (!tally.size) return null;
  return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Every page file that exists in the tree RIGHT NOW, at the ref being read.
 *
 * The link on an entry is derived from the files that commit touched, and those
 * files are evidence about the day it landed — some of them months ago. A page
 * renamed or deleted since would still be in that commit's diff and would still
 * produce a perfectly well-formed URL, pointing at a 404. A dead link on a
 * changelog is worse than no link: the reader follows it, lands nowhere, and
 * stops trusting every other row on the page.
 *
 * So each derived path is checked for membership here before it becomes a link.
 * Read with `git ls-tree`, not a second walk of history — this is a snapshot of
 * one ref, which is exactly the question being asked.
 *
 * An unreadable tree returns an EMPTY set, and an empty set means every link is
 * dropped rather than every link being trusted. That is the safe direction: a
 * sync that writes no links is a page that looks like it did last week, while a
 * sync that writes unvalidated links is a page full of 404s. In practice the
 * case cannot arise on its own — `git log <ref>` succeeding implies `git
 * ls-tree <ref>` does too, and collectChangelog's own fallback to HEAD is
 * mirrored below — so this is a backstop, not a routine path.
 *
 * NOT given GIT_ENV. That environment exists to pin the timezone every date is
 * read in; a tree listing has no dates in it.
 */
function readPageFiles(ref) {
  const list = (target) =>
    execSync(`git ls-tree -r ${target} --name-only`, {
      maxBuffer: 256 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

  let raw = '';
  try {
    raw = list(ref);
  } catch {
    try {
      raw = list('HEAD');
    } catch {
      return new Set();
    }
  }

  const pages = new Set();
  for (const line of raw.split('\n')) {
    const file = line.trim();
    // Narrowed before it is stored: the tree is ~15,000 paths and only the
    // ~1,600 page files can ever be looked up in it.
    if (file.endsWith('/page.tsx')) pages.add(file);
  }
  return pages;
}

const SUBJECT_RE = /^(feat|fix|perf|security)(?:\(([^)]+)\))?(!?):\s*(.+)$/;
const PR_RE = /\s*\(#(\d+)\)\s*$/;

/* ───────────────────────── WAS THIS CHANGE UNDONE? ────────────────────────
 *
 * Director ruling 6 (2026-09-13): "If a change is later undone, its write-up
 * comes down automatically. Nobody should be told to go try something that no
 * longer exists."
 *
 * The first attempt at this (PR #3710) matched revert SUBJECTS, and
 * specs/whats-new/KNOWN-GAP-revert-detection.md records why it could never
 * fire: `Revert "feat(x): …"` does not match SUBJECT_RE above, so a revert was
 * counted as nonUserFacing and dropped before any row was written — nine real
 * revert commits in this repository's history, not one of them survivable. And
 * even had one survived, the subject STORED on the row has had its
 * `type(scope):` prefix stripped and its first letter upper-cased a few dozen
 * lines below, so it could never equal the raw quoted subject a revert carries.
 *
 * So the match moved to the only machine-guaranteed signal there is: the sha.
 * `git revert` — and GitHub's own Revert button — writes `This reverts commit
 * <40-hex>` into the commit BODY, and that sha is exactly the key
 * changelog_entries is keyed by. Nothing is compared as text any more, which
 * also disposes of the false-retraction risk the Director cared most about:
 * because the prefix is stripped on the way in, `feat(events): send a reminder`
 * and `fix(billing): send a reminder` store as the SAME string, and a
 * subject-matched revert of one would have taken down the other's write-up.
 *
 * The revert COMMIT still does not become a changelog entry — nobody wants
 * `Revert "feat(x): …"` listed as news. What it does is stamp `rv` onto the
 * entry it undid, which the sync writes to changelog_entries.reverted_by_sha
 * and the highlight cron reads.
 */

/**
 * The sha a commit body says it reverts, or null.
 *
 * Anchored to the start of a line: the phrase appears verbatim in commit
 * bodies that DISCUSS a revert ("… we had to undo this; this reverts commit
 * abc when it lands"), and a mid-sentence match would retract a live change.
 * Git writes the line at column zero, always, and so does GitHub.
 *
 * Seven hex characters is git's own minimum abbreviation, so short forms are
 * accepted; the caller resolves them against the shas it actually holds and
 * ignores any that are ambiguous.
 */
const REVERTS_BODY_RE = /^This reverts commit ([0-9a-f]{7,40})\b/im;

export function revertedShaFromBody(body) {
  if (typeof body !== 'string' || body === '') return null;
  const m = REVERTS_BODY_RE.exec(body);
  return m ? m[1].toLowerCase() : null;
}

/**
 * One layer of `Revert "<original subject>"`, with the squash-merge pull-request
 * marker optionally sitting OUTSIDE the quotes (GitHub appends it).
 *
 * Greedy inside the quotes so the LAST closing quote closes the revert — an
 * original subject that itself contains a quote character still peels.
 */
const REVERT_SUBJECT_RE = /^Revert\s+"(.*)"\s*(?:\(#\d+\))?\s*$/;
const PR_SUFFIX_RE = /\s*\(#\d+\)\s*$/;

/**
 * The subject a revert commit quotes, or null.
 *
 * WHY THIS EXISTS ALONGSIDE THE BODY READER. Measured against this repository on
 * 2026-09-14: five commits carry a `Revert "…"` subject and only TWO of them
 * still carry `This reverts commit <sha>` in the body — GitHub's squash-merge
 * keeps the subject and throws the body away. A body-only detector would
 * therefore have seen 2 of 5 reverts, which is a detector the page could not be
 * trusted to.
 *
 * ONE LAYER, AND DELIBERATELY NO PARITY RULE. PR #3710 counted quote depth so
 * that `Revert "Revert "X""` (a RE-LAND: X is back) was not read as an undo.
 * That counting is not needed here and is not done here: peeling one layer of
 * a re-land yields the subject of the REVERT commit, the caller resolves that
 * to the revert's own sha, and resolveNetReverts then works out that X is live
 * because the thing that undid it was itself undone. The graph subsumes the
 * parity trick and is also right for the shape parity gets wrong — a re-land
 * written as a fresh `git revert` of the revert commit, which is what actually
 * happened here (#744 reverted #728; #749 re-landed it).
 *
 * The caller must resolve this to a SHA and must refuse an ambiguous match:
 * nothing downstream compares stored subjects, which is the defect
 * specs/whats-new/KNOWN-GAP-revert-detection.md records.
 */
export function revertedSubject(subject) {
  if (typeof subject !== 'string') return null;
  const m = REVERT_SUBJECT_RE.exec(subject.trim());
  if (!m) return null;
  const inner = m[1].trim();
  return inner === '' ? null : inner;
}

/** A raw git subject in the one form both sides of a revert can be compared in:
 *  the quoted copy may carry the original's `(#1234)` or may not, depending on
 *  whether the revert was taken before or after the squash-merge renamed it. */
export function revertMatchKey(subject) {
  return String(subject ?? '').trim().replace(PR_SUFFIX_RE, '').trim();
}

/**
 * Which commits are undone RIGHT NOW, and by what.
 *
 * `edges` is reverter-sha → reverted-sha for every revert commit in the
 * history, user-facing or not. The answer is NOT "X was reverted at some
 * point" — it is "X is reverted as of today", which is the only question the
 * page's reader has.
 *
 * THE RE-LAND IS THE WHOLE DIFFICULTY. `Revert "Revert "X""` means X is BACK,
 * and a detector that stops at one level reads it as an undo and takes down the
 * write-up for a feature that has just returned. PR #3710 handled that by
 * counting quote depth in the subject; counting is not needed here, because the
 * bodies give a real graph: the re-land reverts the REVERT, so X is undone only
 * if some commit reverting it is not itself undone. That generalises past the
 * parity trick — it is also right when the re-land is a fresh `git revert` of
 * the revert commit rather than a nested quoted subject, which is what actually
 * happened in this repository (#744 reverted #728, #749 re-landed it by hand).
 *
 * A hand-written undo ("fix: put the old behaviour back") carries no body line
 * and is invisible here. The Director was shown that gap and accepted it; a
 * missed takedown leaves a stale card, while a false one silently deletes a
 * correct write-up with nothing on the page to say it happened.
 *
 * @param {Map<string, string>} edges reverter sha → the sha it reverts
 * @returns {Map<string, string>} reverted sha → the sha of the revert in force
 */
export function resolveNetReverts(edges) {
  const revertersOf = new Map();
  for (const [reverter, reverted] of edges) {
    if (reverter === reverted) continue; // a commit cannot revert itself
    const list = revertersOf.get(reverted);
    if (list) list.push(reverter);
    else revertersOf.set(reverted, [reverter]);
  }

  const settled = new Map();
  const walking = new Set();
  /** Is `sha`'s effect currently absent from the branch? */
  const isUndone = (sha) => {
    if (settled.has(sha)) return settled.get(sha);
    // A cycle cannot happen in a real history (a commit can only revert an
    // ancestor) but a corrupt or hand-edited body could fabricate one, and a
    // cron must not recurse forever on it. Treating the unknown case as "not
    // undone" keeps the write-up up, which is the safe direction.
    if (walking.has(sha)) return false;
    walking.add(sha);
    let undone = false;
    for (const r of revertersOf.get(sha) ?? []) {
      if (!isUndone(r)) { undone = true; break; }
    }
    walking.delete(sha);
    settled.set(sha, undone);
    return undone;
  };

  const out = new Map();
  for (const [reverted, reverters] of revertersOf) {
    if (!isUndone(reverted)) continue;
    // Which revert is the one holding it down. `edges` is built in git log
    // order (newest first), so the first still-standing reverter is the most
    // recent one — the commit a reader would be pointed at.
    const inForce = reverters.find((r) => !isUndone(r));
    if (inForce) out.set(reverted, inForce);
  }
  return out;
}
/**
 * Read git history and produce the changelog payload.
 *
 * Exported because TWO callers need exactly these rules: the CLI at the bottom
 * of this file, and scripts/sync-changelog-db.mjs, which writes the rows the
 * /whats-new page reads. A second copy of this parsing would drift, and these
 * rules are what decide which of 4,700 commits a student is shown — so there is
 * one copy, here.
 *
 * Takedowns are NOT applied here. Hiding an entry used to mean editing
 * lib/changelog/hidden.mjs and rebuilding; since 2026-09-06 it is the `hidden`
 * column on changelog_entries, set by a person, and the sync deliberately never
 * overwrites it. This function reports what git says. The database remembers
 * what a human decided about it.
 *
 * Returns { ref, gitFailed, entries, modules, contributors, skipped, recovered,
 * links } where an entry is the compact { h, d, at?, t, m, s, a, l?, p?, b? }.
 */
export function collectChangelog({ ref = REF } = {}) {
  // A build or CI host may hand us a SHALLOW clone (Vercel clones with limited
  // depth), and a shallow clone produces a short, wrong changelog that looks
  // perfectly valid. Nothing here can tell the difference, so this function
  // reports `gitFailed` and the entry count and lets the caller decide — the
  // sync script refuses to write when the count collapses against what the
  // table already holds.
  let raw = '';
  let gitFailed = false;
  try {
    raw = execSync(
      `git log ${ref} --format=${RS}%H${US}%an${US}%ae${US}%cd${US}%s${US}%b${US} ${GIT_DATE_FORMAT} --name-only`,
      { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: GIT_ENV }
    );
  } catch {
    // Not a git checkout, or the ref is absent (a shallow CI clone has neither
    // `jicate/main` nor full history).
    gitFailed = true;
    try {
      // The SECOND call site, and it must carry the same date format and the
      // same TZ as the one above. It only runs when `ref` is unreachable — a
      // shallow CI clone, a machine without the remote — so a half-applied
      // change here is invisible on every machine where the first path works
      // and only appears on the one where it does not.
      raw = execSync(
        `git log HEAD --format=${RS}%H${US}%an${US}%ae${US}%cd${US}%s${US}%b${US} ${GIT_DATE_FORMAT} --name-only`,
        { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: GIT_ENV }
      );
    } catch {
      raw = '';
    }
  }

  const entries = [];
  const authorTally = new Map();
  const skipped = { internal: 0, nonUserFacing: 0, engineering: 0, contentFree: 0 };
  const moduleDict = {};
  let recovered = 0;
  /**
   * The page files that exist at `ref` today, read ONCE for the whole run —
   * ~7,000 commits are about to be asked the same membership question.
   *
   * `precise` counts entries that end up with their own deep link; `dropped`
   * counts entries that had one derivable and lost it because the page is no
   * longer in the tree. Everything else falls back to the module's href, which
   * the page already renders.
   */
  const pageFiles = readPageFiles(ref);
  const pageStillExists = (f) => pageFiles.has(f);
  const links = { precise: 0, dropped: 0, treeRead: pageFiles.size };

  /**
   * The revert graph, collected from EVERY commit — including the ones that
   * never become entries.
   *
   * That inclusiveness is the point. A revert commit is not user-facing news
   * and is dropped a few lines below, but the commit it undid usually IS an
   * entry, and a re-land is usually not an entry either. Building the graph
   * before any filtering is what lets the answer be "is X undone today"
   * rather than "did something once claim to undo X".
   */
  const revertEdges = new Map(); // reverter sha → the sha it reverts
  /** Every sha seen, so a short `This reverts commit abc1234` can be resolved. */
  const allShas = [];
  /** sha → the entry object built for it, so `rv` can be stamped after the walk. */
  const entryBySha = new Map();
  /**
   * RAW git subject → the shas that carry it, and each sha's position in the
   * log (newest first). Raw, not stored: the stored subject has had its
   * `type(scope):` prefix stripped and its first letter upper-cased, and
   * comparing THAT against a revert's quoted copy is blocker 2 of
   * specs/whats-new/KNOWN-GAP-revert-detection.md. Here nothing is compared
   * after the fact — a subject is resolved to a sha ONCE, at read time, against
   * the same git output it came from.
   */
  const shasBySubject = new Map();
  const positionOf = new Map();
  /** Reverts whose body was thrown away by a squash-merge: [reverter sha, quoted subject]. */
  const subjectReverts = [];
  let position = 0;

  for (const rec of raw.split(RS)) {
    const line = rec.replace(/^\n/, '');
    if (!line.trim()) continue;
    const parts = line.split(US);
    const [sha, name, email, committedAt] = parts;
    // `committedAt` is `2026-09-12T19:40:00+05:30`. The first ten characters are
    // the day, which is what `--date=short` used to hand back and what the
    // `date` column, the date headers, the 90-day split and both indexes are
    // built on — so `d` is unchanged in meaning and in type.
    //
    // The slice is written to survive a git that does not know
    // `iso-strict-local` and falls back to a bare `YYYY-MM-DD`: `d` is still
    // right, and `at` is simply absent rather than malformed. An absent `at` is
    // a state the whole chain already has to handle — every row in the table is
    // in it until the first sync after this ships.
    const date = (committedAt ?? '').slice(0, 10);
    const at = (committedAt ?? '').includes('T') ? committedAt : null;
    const subject = parts[4];
    // The commit BODY. Read for exactly one thing — `This reverts commit <sha>`
    // — and then discarded; nothing from it is ever stored or displayed.
    const body = parts[5] ?? '';
    // Everything after the last separator is the --name-only file list. Index 6
    // since the body joined the format: leave this at 5 and every entry's module
    // is recovered from the body text instead of from its changed files, which
    // is valid JavaScript and entirely wrong data.
    const files = (parts[6] ?? '').split('\n').map((f) => f.trim()).filter(Boolean);

    // BEFORE the user-facing filter, deliberately. A revert commit fails
    // SUBJECT_RE and is dropped two lines below — that is correct, it is not
    // news — but its edge is the whole signal, and collecting it after the
    // `continue` is exactly the dead code this change exists to remove.
    if (sha) {
      allShas.push(sha);
      positionOf.set(sha, position++);
      if (subject) {
        const key = revertMatchKey(subject);
        const bucket = shasBySubject.get(key);
        if (bucket) bucket.push(sha);
        else shasBySubject.set(key, [sha]);
      }
      const reverted = revertedShaFromBody(body);
      if (reverted) revertEdges.set(sha, reverted);
      else {
        const quoted = revertedSubject(subject ?? '');
        if (quoted) subjectReverts.push([sha, revertMatchKey(quoted)]);
      }
    }

    if (!subject) continue;

    const m = subject.match(SUBJECT_RE);
    if (!m) { skipped.nonUserFacing++; continue; }

    const [, type, rawScope, breaking, rawText] = m;
    let scopeTop = (rawScope || '').split('/')[0].toLowerCase().trim();
    if (INTERNAL_SCOPES.has(scopeTop)) { skipped.internal++; continue; }
    // No scope, or one we do not recognise: ask the files instead of defaulting
    // to the everyone-can-read bucket.
    // The infra-only guard deliberately runs ONLY when the author gave us no
    // usable scope. A review pass argued it should be unconditional, on the
    // grounds that a `feat(billing)` commit touching nothing but
    // supabase/migrations has no user-visible surface. Measured before acting:
    // 686 user-facing commits touch only infra paths, 667 of them carry an
    // explicit author scope, and 569 are supabase/. Reading them, they are real
    // news that simply ships as a database change — "the Move-to-Account preview
    // refused learners the commit would have admitted", "hide names on the
    // All-JKKN shelf". In a Supabase app, RLS and migrations ARE the product
    // surface. Making this unconditional dropped 543 entries (11.5%) of genuine
    // news, so it stays scoped to the no-signal case: no usable scope AND only
    // infra files means nothing tells us it is news.
    if (!lookupModule(scopeTop)) {
      const fromFiles = scopeFromFiles(files);
      if (fromFiles) {
        scopeTop = fromFiles;
        recovered++;
      } else if (isAllInfra(files)) {
        skipped.internal++;
        continue;
      }
    }

    const prMatch = rawText.match(PR_RE);
    // Order matters: the PR number is stripped first (it is always outermost),
    // then the auto-triage bug tail it was hiding.
    const text = redactIdentifiers(stripBugRefs(rawText.replace(PR_RE, ''))).trim();
    if (!text) continue;
    if (isInternalEngineering(text)) { skipped.engineering++; continue; }
    if (isContentFree(text)) { skipped.contentFree++; continue; }

    const mod = moduleFor(scopeTop);
    moduleDict[mod.key] = { label: mod.label, perm: mod.perm, href: mod.href };

    const who = author(name, email);
    authorTally.set(who, (authorTally.get(who) || 0) + 1);

    /*
     * WHERE the change happened, from the SAME file list the module was
     * recovered from a few lines above. Deliberately not a second read of git:
     * `--name-only` is already on the log format and `files` is already parsed,
     * so this is one more question asked of data we hold, not another walk of
     * 7,000 commits.
     *
     * Null for roughly three quarters of entries — a migration, a service, a
     * cron route, a component shared by six screens. That is the honest answer
     * and the page falls back to the module's own href for it. Only a commit
     * that touched a real, still-present, non-dynamic page gets a deep link.
     */
    const link = entryHref(files, pageStillExists);
    if (link.href) links.precise += 1;
    if (link.dropped) links.dropped += 1;

    const entry = {
      // 12, not 7. This is the natural key the database upserts on, so a prefix
    // collision is not cosmetic: two colliding shas in one batch raise 21000 and
    // roll back every future sync, and across batches the second silently
    // overwrites the first, losing an entry permanently. 7 hex chars is 268M
    // values, which by the birthday bound is already ~4% likely across 4,769
    // entries and ~27% by 12,000. Git itself auto-grows abbreviations for this
    // reason; a fixed column cannot, so it starts wide.
    h: sha.slice(0, 12),
      d: date,
      // The instant the change landed, in IST, offset attached. `d` is its first
      // ten characters, so the two can never name different days.
      ...(at ? { at } : {}),
      t: USER_FACING[type],
      m: mod.key,
      s: text.charAt(0).toUpperCase() + text.slice(1),
      a: who,
      // The screen this change happened on. ABSENT rather than null when there
      // is none, like `p` and `b` below — the page tests for presence, and the
      // database column is nullable for exactly the same reason.
      ...(link.href ? { l: link.href } : {}),
      ...(prMatch ? { p: Number(prMatch[1]) } : {}),
      ...(breaking ? { b: 1 } : {}),
    };
    entries.push(entry);
    // Keyed by the FULL sha, not the stored 12, because that is what a body's
    // `This reverts commit …` line carries.
    entryBySha.set(sha, entry);
  }

  /*
   * RULING 6, the seam that #3710 never reached: stamp the entries whose change
   * is not on the branch any more.
   *
   * Everything above this point is per-commit; this is the one question that
   * cannot be answered until the whole history has been read, because a revert
   * can be re-landed by a commit that comes AFTER it.
   *
   * `rv` is absent — not null — for the ordinary entry, the same shape `l`, `p`
   * and `b` use: the sync turns absence into a NULL column and the page tests
   * for presence.
   */
  /*
   * The squash-merged reverts, resolved to shas now that every subject is known.
   *
   * REFUSED rather than guessed when the quoted subject names more than one
   * commit, or names none, or names a commit that is not OLDER than the revert.
   * A revert can only undo an ancestor, so a later commit carrying the same
   * subject is a re-application, and matching it would take down the write-up
   * for the change that is live — the exact failure the Director ranked worst.
   */
  for (const [reverter, key] of subjectReverts) {
    const hits = (shasBySubject.get(key) ?? []).filter(
      (s) => s !== reverter && positionOf.get(s) > positionOf.get(reverter)
    );
    if (hits.length !== 1) continue;
    revertEdges.set(reverter, hits[0]);
  }

  let reverted = 0;
  if (revertEdges.size > 0) {
    // Resolve any abbreviated sha in a body against the shas actually read. An
    // abbreviation that matches two commits is DROPPED rather than guessed —
    // retracting the wrong write-up is the failure the Director ranked worst.
    const resolveShaPrefix = (p) => {
      if (entryBySha.has(p) || p.length === 40) return p;
      const hits = allShas.filter((s) => s.startsWith(p));
      return hits.length === 1 ? hits[0] : p;
    };
    const edges = new Map();
    for (const [reverter, target] of revertEdges) edges.set(reverter, resolveShaPrefix(target));

    for (const [undoneSha, bySha] of resolveNetReverts(edges)) {
      const e = entryBySha.get(undoneSha);
      // A revert of something that is not an entry — a chore, a doc, a commit
      // older than this app's start date — is simply nothing to take down.
      if (!e) continue;
      e.rv = bySha.slice(0, 12);
      reverted += 1;
    }
  }

  // Newest first. git log's ordering is topological, not strictly chronological,
  // so a handful of commits land out of date order. A changelog is read as a
  // timeline, so sort explicitly. Array.prototype.sort is stable, which keeps
  // commits made on the same day in the order they were committed.
  entries.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

  return {
    ref,
    gitFailed,
    entries,
    // The module dictionary travels WITH the entries, so no caller re-derives it.
    // `perm` is the permission namespace a reader is tested against.
    modules: Object.fromEntries(Object.entries(moduleDict).sort()),
    contributors: [...authorTally.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    skipped,
    recovered,
    links,
    // How many entries carry `rv` — a change that is no longer on the branch.
    // Reported so a run that suddenly stamps hundreds is visible as a fault
    // rather than as a very busy afternoon of takedowns.
    reverted,
  };
}

/* ─────────────────────────────── CLI ──────────────────────────────────────
 * Read-only. `npm run changelog` used to write the three JSON files and they
 * were committed; both are gone. Writing the rows is scripts/sync-changelog-db.mjs
 * and nothing else. This is here so a person can see what the rules produce
 * without touching the database — bare for a summary, `--json` for the payload.
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const out = collectChangelog();
  const { entries, modules, contributors, skipped, recovered, links } = out;

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify({ entries, modules, contributors }));
  } else {
    const first = entries[entries.length - 1]?.d ?? null;
    const latest = entries[0]?.d ?? null;
    console.log(`changelog: ${entries.length} entries  ${first} → ${latest}  (ref ${out.ref})`);
    if (out.gitFailed) {
      console.warn(`  WARNING: ${out.ref} was not reachable — read HEAD instead. A shallow`);
      console.warn(`  clone reads as a short history; run \`git fetch jicate main\` for the full one.`);
    }
    console.log(`  skipped: ${skipped.nonUserFacing} non-user-facing, ${skipped.internal} internal-scope`);
    console.log(`           ${skipped.engineering} build-toolchain, ${skipped.contentFree} content-free titles`);
    console.log(`  module recovered from changed files: ${recovered}`);
  console.log(`  entries whose change was reverted and is not on the branch: ${out.reverted}`);
    console.log(`  deep links: ${links.precise} entries open their own screen, ` +
      `${entries.length - links.precise} fall back to their module` +
      (links.dropped ? `, ${links.dropped} lost a link to a page that no longer exists` : ''));
    console.log(`  platform (everyone-can-read) entries: ${entries.filter((e) => e.m === 'platform').length}`);
    console.log(`  contributors: ${contributors.length}, modules: ${Object.keys(modules).length}`);
    console.log(`  nothing written — entries live in changelog_entries; see scripts/sync-changelog-db.mjs`);
  }
}
