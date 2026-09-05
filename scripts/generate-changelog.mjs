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
 * Output: public/changelog/data.json (fetched at runtime, so it never enters
 * the JS bundle) + public/changelog/meta.json.
 *
 * Run: npm run changelog
 */
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { moduleFor } from '../lib/changelog/modules.mjs';
import { INTERNAL_SCOPES } from '../lib/changelog/modules.mjs';

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
]);

function author(name, email) {
  const e = (email || '').toLowerCase();
  if (IDENTITY.has(e)) return IDENTITY.get(e);
  // director@jkkn.ac.in is shared by the Director and the AI engineering fleet;
  // the committer NAME is what disambiguates them, so trust it here.
  if (e === 'director@jkkn.ac.in') return name === 'Ommsharravana' ? 'Ommsharravana' : 'JKKN AI Engineering';
  // Fleet sessions sign as `sim` from an @jkkn.ac.in account — org-verifiable.
  if (name === 'sim' && e.endsWith('@jkkn.ac.in')) return 'JKKN AI Engineering';
  return name;
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
    `git log ${REF} --format=%H${US}%an${US}%ae${US}%ad${US}%s${RS} --date=short`,
    { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  );
} catch {
  // Not a git checkout, or the ref is absent (a shallow CI clone has neither
  // `jicate/main` nor full history).
  gitFailed = true;
  try {
    raw = execSync(
      `git log HEAD --format=%H${US}%an${US}%ae${US}%ad${US}%s${RS} --date=short`,
      { maxBuffer: 256 * 1024 * 1024, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
  } catch {
    raw = '';
  }
}

const entries = [];
const authorTally = new Map();
const skipped = { internal: 0, nonUserFacing: 0 };
const moduleDict = {};

for (const rec of raw.split(RS)) {
  const line = rec.replace(/^\n/, '');
  if (!line.trim()) continue;
  const [sha, name, email, date, ...rest] = line.split(US);
  const subject = rest.join(US);
  if (!subject) continue;

  const m = subject.match(SUBJECT_RE);
  if (!m) { skipped.nonUserFacing++; continue; }

  const [, type, rawScope, breaking, rawText] = m;
  const scopeTop = (rawScope || '').split('/')[0].toLowerCase().trim();
  if (INTERNAL_SCOPES.has(scopeTop)) { skipped.internal++; continue; }

  const prMatch = rawText.match(PR_RE);
  const text = rawText.replace(PR_RE, '').trim();
  if (!text) continue;

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
// Refuse to overwrite a good changelog with a truncated one.
const META_PATH = 'public/changelog/meta.json';
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

mkdirSync('public/changelog', { recursive: true });

// Split the payload. The Director reads this on a phone: shipping 187 KB of
// six-month history on first paint is the wrong trade. `recent.json` covers the
// last 90 days and renders immediately; `archive.json` is fetched only when the
// reader asks for older changes.
const CUTOFF = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const recent = entries.filter((e) => e.d >= CUTOFF);
const archive = entries.filter((e) => e.d < CUTOFF);
writeFileSync('public/changelog/recent.json', JSON.stringify(recent));
writeFileSync('public/changelog/archive.json', JSON.stringify(archive));

const months = [...new Set(entries.map((e) => e.d.slice(0, 7)))].sort().reverse();
const meta = {
  generatedAt: new Date().toISOString().slice(0, 10),
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
writeFileSync('public/changelog/meta.json', JSON.stringify(meta, null, 2));

console.log(`changelog: ${entries.length} entries  ${meta.first} → ${meta.latest}`);
console.log(`  recent (90d): ${recent.length}   archive: ${archive.length}`);
console.log(`  skipped: ${skipped.nonUserFacing} non-user-facing, ${skipped.internal} internal-scope`);
console.log(`  contributors: ${meta.contributors.length}, modules: ${Object.keys(meta.modules).length}`);
console.log(`  unmapped scopes -> "platform": run with CHANGELOG_DEBUG=1 to list`);
