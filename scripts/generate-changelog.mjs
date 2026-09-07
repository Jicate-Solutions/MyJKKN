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
 * Output: lib/changelog/data/{recent,archive,meta}.json. NOT public/ — anything
 * ending in .json there is treated as a public static asset by proxy.ts and
 * bypasses auth. Served only via the authenticated route app/api/whats-new.
 *
 * Run: npm run changelog
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { moduleFor, lookupModule } from '../lib/changelog/modules.mjs';
import { INTERNAL_SCOPES } from '../lib/changelog/modules.mjs';
import {
  stripBugRefs,
  isInternalEngineering,
  isContentFree,
  redactIdentifiers,
} from '../lib/changelog/title-rules.mjs';
import { HIDDEN } from '../lib/changelog/hidden.mjs';

const REF = process.env.CHANGELOG_REF || 'jicate/main';
const US = '\x1f'; // field separator
const RS = '\x1e'; // record separator

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

const SUBJECT_RE = /^(feat|fix|perf|security)(?:\(([^)]+)\))?(!?):\s*(.+)$/;
const PR_RE = /\s*\(#(\d+)\)\s*$/;


// The changelog regenerates on every build, so a merge is on the page as soon
// as it deploys. But a build host may hand us a SHALLOW clone (Vercel clones
// with limited depth), and a shallow clone produces a short, wrong changelog
// that looks perfectly valid. Rather than silently publish six months of
// history as two weeks, fall back to the committed files and say so.
let raw = '';
let gitFailed = false;
try {
  raw = execSync(
    `git log ${REF} --format=${RS}%H${US}%an${US}%ae${US}%cd${US}%s${US} --date=short --name-only`,
    { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
} catch {
  // Not a git checkout, or the ref is absent (a shallow CI clone has neither
  // `jicate/main` nor full history).
  gitFailed = true;
  try {
    raw = execSync(
      `git log HEAD --format=${RS}%H${US}%an${US}%ae${US}%cd${US}%s${US} --date=short --name-only`,
      { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch {
    raw = '';
  }
}

const entries = [];
const authorTally = new Map();
const skipped = { internal: 0, hidden: 0, nonUserFacing: 0, engineering: 0, contentFree: 0 };
const moduleDict = {};
let recovered = 0;

for (const rec of raw.split(RS)) {
  const line = rec.replace(/^\n/, '');
  if (!line.trim()) continue;
  const parts = line.split(US);
  const [sha, name, email, date] = parts;
  const subject = parts[4];
  // Everything after the last separator is the --name-only file list.
  const files = (parts[5] ?? '').split('\n').map((f) => f.trim()).filter(Boolean);
  if (!subject) continue;

  // The one manual override on an otherwise fully automatic page — see
  // lib/changelog/hidden.mjs. Checked before any other rule so a hidden entry
  // costs nothing and cannot be resurrected by a later rule change.
  if (HIDDEN.has(sha.slice(0, 7))) { skipped.hidden++; continue; }

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

  entries.push({
    h: sha.slice(0, 7),
    d: date,
    t: USER_FACING[type],
    m: moduleFor(scopeTop).key,
    s: text.charAt(0).toUpperCase() + text.slice(1),
    a: who,
    ...(prMatch ? { p: Number(prMatch[1]) } : {}),
    ...(breaking ? { b: 1 } : {}),
  });
}

// Newest first; git log is already reverse-chronological, but same-day commits
// keep their commit order, which is what we want inside a day.
// git log's ordering is topological, not strictly chronological, so a handful of
// commits still land out of date order. A changelog is read as a timeline, so
// sort explicitly. Array.prototype.sort is stable, which keeps commits made on
// the same day in the order they were committed.
entries.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));

// Refuse to overwrite a good changelog with a truncated one.
const META_PATH = 'lib/changelog/data/meta.json';
if (existsSync(META_PATH)) {
  const prev = JSON.parse(readFileSync(META_PATH, 'utf8'));
  if (entries.length < prev.total * 0.9) {
    console.warn(
      `changelog: KEEPING the committed files. Git gave ${entries.length} entries but ` +
        `${prev.total} are already published${gitFailed ? ' (ref ' + REF + ' not reachable — shallow clone?)' : ''}. ` +
        `Run \`git fetch jicate main\` for a full history, then \`npm run changelog\`.`
    );
    process.exit(0);
  }
}

mkdirSync('lib/changelog/data', { recursive: true });

// Split the payload. The Director reads this on a phone: shipping 187 KB of
// six-month history on first paint is the wrong trade. `recent.json` covers the
// last 90 days and renders immediately; `archive.json` is fetched only when the
// reader asks for older changes.
const CUTOFF = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const recent = entries.filter((e) => e.d >= CUTOFF);
const archive = entries.filter((e) => e.d < CUTOFF);
writeFileSync('lib/changelog/data/recent.json', JSON.stringify(recent));
writeFileSync('lib/changelog/data/archive.json', JSON.stringify(archive));

const months = [...new Set(entries.map((e) => e.d.slice(0, 7)))].sort().reverse();
const meta = {
  // en-CA formats as YYYY-MM-DD, and LOCAL time - entry dates come from each
  // commit's own +05:30 offset via %cd, so a UTC stamp here printed
  // "Updated 5 September" above an entry dated 6 September.
  generatedAt: new Date().toLocaleDateString('en-CA'),
  ref: REF,
  total: entries.length,
  first: entries[entries.length - 1]?.d ?? null,
  latest: entries[0]?.d ?? null,
  months,
  recentFrom: CUTOFF,
  recentCount: recent.length,
  archiveCount: archive.length,
  contributors: [...authorTally.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count })),
  // The module dictionary travels WITH the data, so the page never re-derives it.
  // `perm` is the permission namespace the page tests the viewer against.
  modules: Object.fromEntries(Object.entries(moduleDict).sort()),
};
writeFileSync('lib/changelog/data/meta.json', JSON.stringify(meta, null, 2));

console.log(`changelog: ${entries.length} entries  ${meta.first} → ${meta.latest}`);
console.log(`  recent (90d): ${recent.length}   archive: ${archive.length}`);
console.log(`  skipped: ${skipped.nonUserFacing} non-user-facing, ${skipped.internal} internal-scope`);
console.log(`           ${skipped.engineering} build-toolchain, ${skipped.contentFree} content-free titles`);
if (skipped.hidden) console.log(`  hidden by lib/changelog/hidden.mjs: ${skipped.hidden}`);
console.log(`  module recovered from changed files: ${recovered}`);
console.log(`  platform (everyone-can-read) entries: ${entries.filter((e) => e.m === 'platform').length}`);
console.log(`  contributors: ${meta.contributors.length}, modules: ${Object.keys(meta.modules).length}`);
console.log(`  unmapped scopes -> "platform": run with CHANGELOG_DEBUG=1 to list`);
