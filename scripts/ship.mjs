#!/usr/bin/env node
/**
 * ship — land work on main without a direct push.
 *
 * `main` is protected AND enforce_admins is on, so `git push origin main` is
 * refused even for repo admins (GH006). The protection is worth keeping: three
 * status checks are required — JKKN terminology, Nav-config hrefs match
 * page.tsx, No Radix SelectItem with empty value — and the terminology gate has
 * already blocked a merge that would otherwise have shipped (PR #3356).
 *
 * But required_approving_review_count is 0, so nobody has to review. That makes
 * the PR route pure ceremony that a script can perform:
 *
 *     branch → commit → rebase → push → PR → auto-merge → sync main
 *
 * Usage:
 *   npm run ship -- "fix(hr): repair leave balances"   commit everything, then ship
 *   npm run ship                                        ship commits already made
 *   npm run ship -- --no-wait "feat(x): ..."            don't block on CI
 *   npm run ship -- --draft "wip(x): ..."               open the PR, don't auto-merge
 *
 * Exit codes: 0 shipped (or PR opened with --no-wait/--draft), 1 failed.
 */
import { execFileSync, execSync } from 'node:child_process';

const RESET = '\x1b[0m', DIM = '\x1b[2m', BOLD = '\x1b[1m';
const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const message = argv.filter((a) => !a.startsWith('--')).join(' ').trim();
const WAIT = !flags.has('--no-wait') && !flags.has('--draft');
const DRAFT = flags.has('--draft');

const die = (msg, hint) => {
  console.error(`${RED}✗ ${msg}${RESET}`);
  if (hint) console.error(`${DIM}  ${hint}${RESET}`);
  process.exit(1);
};
const step = (msg) => console.log(`${CYAN}→${RESET} ${msg}`);
const ok = (msg) => console.log(`${GREEN}✓${RESET} ${msg}`);

/** Run a command, return trimmed stdout. Throws on non-zero. */
const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();
/** Run for effect; inherit stderr so git/gh explain their own failures. */
const shLoud = (cmd, args) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const git = (...args) => sh('git', args);
const tryGit = (...args) => { try { return git(...args); } catch { return null; } };

// ── Preflight ───────────────────────────────────────────────────────────────
try { sh('gh', ['auth', 'status']); }
catch { die('GitHub CLI is not authenticated.', 'Run: gh auth login'); }

const DEFAULT_BRANCH = (() => {
  try { return sh('gh', ['repo', 'view', '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name']); }
  catch { return 'main'; }
})();

const dirty = git('status', '--porcelain');
if (dirty && !message) {
  die('You have uncommitted changes but gave no commit message.',
      'npm run ship -- "fix(scope): what changed"');
}

// ── Branch name from the message, or from the last commit ───────────────────
const subject = message || tryGit('log', '-1', '--format=%s') || '';
if (!subject) die('Nothing to ship: no message and no commits.');

const slug = subject
  .replace(/^(\w+)(\([^)]*\))?!?:\s*/, '')      // drop a conventional-commit prefix
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48)
  .replace(/-+$/, '') || 'change';
const type = /^(\w+)(\([^)]*\))?!?:/.exec(subject)?.[1] ?? 'chore';
const prefix = ['fix', 'feat', 'docs', 'refactor', 'perf', 'test', 'chore'].includes(type) ? type : 'chore';
const branch = `${prefix}/${slug}`;

const startBranch = git('rev-parse', '--abbrev-ref', 'HEAD');

// ── Move onto a feature branch ──────────────────────────────────────────────
// Commits sitting on a local main cannot be pushed, so they are carried over.
if (startBranch === DEFAULT_BRANCH) {
  step(`branch  ${BOLD}${branch}${RESET}`);
  try { git('checkout', '-b', branch); }
  catch { die(`Branch ${branch} already exists.`, `Delete it first: git branch -D ${branch}`); }
} else {
  console.log(`${DIM}→ branch  ${startBranch} (already on a feature branch)${RESET}`);
}
const workBranch = git('rev-parse', '--abbrev-ref', 'HEAD');

// ── Commit ──────────────────────────────────────────────────────────────────
if (dirty) {
  git('add', '-A');
  const body = `${subject}\n\nCo-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>\n`;
  execFileSync('git', ['commit', '-F', '-'], { input: body, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
  ok(`commit  ${git('rev-parse', '--short', 'HEAD')}`);
}

// ── Rebase onto the live default branch ─────────────────────────────────────
// main moves often here; rebasing now turns a merge conflict at PR time into a
// conflict you resolve locally, with the work still in front of you.
step(`rebase  onto origin/${DEFAULT_BRANCH}`);
git('fetch', 'origin', DEFAULT_BRANCH, '--quiet');
const behind = Number(git('rev-list', '--count', `HEAD..origin/${DEFAULT_BRANCH}`));
if (behind > 0) {
  try { shLoud('git', ['rebase', `origin/${DEFAULT_BRANCH}`]); }
  catch {
    die(`Rebase hit a conflict (${behind} commit(s) landed on ${DEFAULT_BRANCH} first).`,
        'Resolve, `git rebase --continue`, then re-run npm run ship.');
  }
  ok(`rebase  replayed over ${behind} upstream commit(s)`);
} else {
  console.log(`${DIM}✓ rebase  already up to date${RESET}`);
}

const ahead = Number(git('rev-list', '--count', `origin/${DEFAULT_BRANCH}..HEAD`));
if (ahead === 0) die('Nothing to ship — no commits ahead of origin/' + DEFAULT_BRANCH + '.');

// ── Push ────────────────────────────────────────────────────────────────────
step(`push    origin/${workBranch}`);
shLoud('git', ['push', '-u', '--force-with-lease', 'origin', workBranch]);

// ── PR ──────────────────────────────────────────────────────────────────────
let prNumber = tryGit('rev-parse', 'HEAD') && (() => {
  try { return sh('gh', ['pr', 'view', '--json', 'number', '-q', '.number']); } catch { return null; }
})();

if (!prNumber) {
  const args = ['pr', 'create', '--base', DEFAULT_BRANCH, '--head', workBranch, '--fill'];
  if (DRAFT) args.push('--draft');
  const url = shLoud('gh', args);
  prNumber = url.trim().split('/').pop();
  ok(`PR      #${prNumber}  ${DIM}${url.trim()}${RESET}`);
} else {
  ok(`PR      #${prNumber} (already open, updated)`);
}

if (DRAFT) {
  console.log(`\n${YELLOW}Draft — not auto-merging.${RESET} Mark ready when you want it to land:`);
  console.log(`${DIM}  gh pr ready ${prNumber} && gh pr merge ${prNumber} --auto --squash --delete-branch${RESET}`);
  process.exit(0);
}

// ── Auto-merge ──────────────────────────────────────────────────────────────
// Queues the squash the moment the 3 required checks go green. If they fail,
// nothing merges and the PR stays open — which is the point of the gates.
step('automerge enabled (squash)');
try {
  sh('gh', ['pr', 'merge', String(prNumber), '--auto', '--squash', '--delete-branch']);
} catch (e) {
  console.error(`${YELLOW}! auto-merge could not be enabled${RESET} ${DIM}${e.stderr?.trim() ?? ''}${RESET}`);
  console.error(`${DIM}  The PR is open; merge it yourself: gh pr merge ${prNumber} --squash --delete-branch${RESET}`);
  process.exit(1);
}

if (!WAIT) {
  console.log(`\n${GREEN}Queued.${RESET} PR #${prNumber} will squash-merge on its own once checks pass.`);
  process.exit(0);
}

// ── Wait for it to land ─────────────────────────────────────────────────────
console.log(`\n${DIM}waiting for the 3 required checks…  (ctrl-c is safe — auto-merge stays armed)${RESET}`);
const started = Date.now();
const DEADLINE_MS = 15 * 60_000;
let state = '';
while (Date.now() - started < DEADLINE_MS) {
  await new Promise((r) => setTimeout(r, 15_000));
  try {
    state = sh('gh', ['pr', 'view', String(prNumber), '--json', 'state', '-q', '.state']);
  } catch { continue; }
  const secs = Math.round((Date.now() - started) / 1000);
  if (state === 'MERGED') break;
  if (state === 'CLOSED') die(`PR #${prNumber} was closed without merging.`);
  const failed = (() => {
    try { return sh('gh', ['pr', 'checks', String(prNumber)]).split('\n').filter((l) => /\bfail\b/.test(l)); }
    catch { return []; }
  })();
  if (failed.length) {
    console.error(`\n${RED}✗ a required check failed after ${secs}s — nothing merged:${RESET}`);
    for (const l of failed) console.error(`  ${RED}•${RESET} ${l.split('\t')[0]}`);
    die(`PR #${prNumber} is still open.`, `gh pr checks ${prNumber}   # full list`);
  }
  process.stdout.write(`${DIM}  …${secs}s${RESET}\r`);
}
if (state !== 'MERGED') {
  console.log(`\n${YELLOW}Still not merged after 15 min — auto-merge is still armed.${RESET}`);
  console.log(`${DIM}  gh pr checks ${prNumber}${RESET}`);
  process.exit(0);
}

// ── Sync local main ─────────────────────────────────────────────────────────
const sha = sh('gh', ['pr', 'view', String(prNumber), '--json', 'mergeCommit', '-q', '.mergeCommit.oid']).slice(0, 9);
ok(`merged  ${sha} → ${DEFAULT_BRANCH}`);
git('checkout', DEFAULT_BRANCH);
git('fetch', 'origin', '--prune', '--quiet');
git('reset', '--hard', `origin/${DEFAULT_BRANCH}`);
tryGit('branch', '-D', workBranch);
ok(`synced  local ${DEFAULT_BRANCH} at ${git('rev-parse', '--short', 'HEAD')}, branch deleted`);
console.log(`\n${GREEN}${BOLD}Shipped.${RESET}`);
