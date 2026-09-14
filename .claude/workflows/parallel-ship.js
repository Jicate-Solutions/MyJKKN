export const meta = {
  name: 'parallel-ship',
  description: 'Fan out independent MyJKKN build specs as unattended worktree lanes — each sweeps, builds, gates, opens a PR, and is verified by TWO adversarial reviewers on different models (Sonnet tie-break if they still disagree), plus an optional model-driven persona browser sweep for UI PRs',
  whenToUse: 'When 1+ independent (different-files) MyJKKN changes should each become a jicate/main worktree PR. args = [{branch, title, spec, uiSweep?, prodAck?, personas?, cheapTrial?}, ...]. Up to 6 lanes per call (Director, 2026-09-02). Branch names must not contain "main". uiSweep:true adds the persona browser sweep — ask the Director for prodAck FIRST when .env.local is prod-connected.',
  phases: [
    { title: 'Build', detail: 'one unattended builder per spec — production sweep → build → gate mirrors → PR (Draft only if it carries risky assumptions); stops if the thing already exists' },
    { title: 'Verify A', detail: 'adversarial reviewer on the session model — CI per head-sha + diff-vs-spec + scope creep' },
    { title: 'Verify B', detail: 'second adversarial reviewer on a DIFFERENT model (opus) — behaviour, grants, migrations' },
    { title: 'Persona sweep', detail: 'optional, UI PRs only — the model drives the connected Chrome as each affected persona (workflow-test Mode E); labels the PR not-browser-checked when it cannot run' },
    { title: 'Gate mirror (cheap trial)', detail: 'optional low-effort re-run of the mechanical gates — measuring whether cheap mode holds quality' },
    { title: 'Reconcile', detail: 'reviewers disagree: builder (Fable 5.1) fixes or rebuts, Opus re-looks once' },
    { title: 'Tie-break', detail: 'still disagreeing after the fix round: a third brain (Sonnet) votes; majority decides' },
  ],
}

// ── Fable 5.1 shape (2026-09-02) + the Director's twelve interview decisions ──
// Q1 second checker = opus · Q2 persona sweep on prod-connected env = ask prodAck
// per lane · Q3 up to 6 lanes per call · Q4 cheap-mode trial stage (low effort) ·
// E1 disagreement blocks → one reconcile round (fixer = the session model, Fable
// 5.1; finder/re-look = opus) · E2 already-exists → stop and report · E3 only
// [risky] silent choices reach the Director, 3 per round (E6), PR stays DRAFT
// until answered · E4 sweep couldn't run → Ready + not-browser-checked label ·
// E5 Actions budget low → keep full speed (no throttle in code) · E7 still
// disagreeing after reconcile → third checker (sonnet) tie-break, majority ·
// E8 (reporting) lives in the chain SKILL, not here.

if (!Array.isArray(args) || args.length === 0) {
  throw new Error('parallel-ship needs args = [{branch, title, spec}, ...]')
}
if (args.length > 6) {
  throw new Error(`parallel-ship runs at most 6 lanes per call (Director decision 2026-09-02); got ${args.length} — split into two calls`)
}
for (const s of args) {
  if (!s.branch || /main/.test(s.branch)) throw new Error(`bad branch name (empty or contains "main"): ${s.branch}`)
}

const BUILD_BOILERPLATE = `
STEP 0 (MANDATORY): git fetch jicate main && git checkout -B <BRANCH> jicate/main; verify git log -1 matches jicate/main head. The default worktree base is a 720-commit-diverged local branch — building on it is fatal.
STEP 0.5 (MANDATORY, unattended production-code sweep — paste its output into the PR body): pick 5+ domain keywords incl. synonyms from your spec and run: git ls-tree jicate/main -r --name-only | grep -iE "(kw1|kw2|kw3|syn1|syn2)"; then gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "<keywords> in:title". Read 2-3 hits. IF THE THING YOU WERE ASKED TO BUILD ALREADY EXISTS on main or in an open PR: build NOTHING, open NO PR, and return {already_exists:true, where:"<file paths / PR numbers / route>", surprises:"..."} — the Director decides whether the existing one is enough.
ASSUMPTIONS (unattended stand-in for the assumption-thrash interview): every silent decision you make (a value list, a default, a column meaning, a scope choice) goes in the PR body under '## Assumptions for review', one line each, each PREFIXED [safe] or [risky]. [risky] = a wrong guess would change data, money, permissions, who gets notified, or what a number means; everything else is [safe]. Return the [risky] ones verbatim in risky_assumptions[], MOST IMPORTANT FIRST — they become one-tap questions for the Director, 3 per round, before merge.
GATES: terminology "learner" never "student"; no console.log; minimal traceable diff — touch ONLY the files your spec names; migrations are FILES ONLY (never applied here — apply is the orchestrator's merge-time step); every CREATE OR REPLACE of a SECDEF fn re-asserts REVOKE FROM anon, PUBLIC in the same file; SQL_FILE_INDEX.md gets one appended line per new migration. Mirror the bespoke CI gates locally before push (bash scripts/ci/check-nav-config-hrefs.sh · bash scripts/ci/check-radix-select-empty-values.sh · node scripts/check-permissions-catalog.mjs; the test runner is vitest — run the invariant tests that touch your files). Paste every gate's exit line VERBATIM in the PR body; a described result is not a gate result. State plainly anything you could NOT verify.
ENV SAFETY (Step 0 of the build-depth gate): if grep NEXT_PUBLIC_SUPABASE_URL .env.local contains kvizhngldtiuufknvehv, the repo is PROD-CONNECTED — do NOT start a dev server or navigate pages unless your spec carries prodAck:true; narrow fixes need none.
GIT SAFETY (workers run in PARALLEL against a SHARED repo — absolute): never stash or pop a stash (the stash is global — popping can steal another worker's work). Never discard a working tree or rewrite shared history. Never force-push; never push to a branch that is not yours. Stage only the specific files your spec required — never "git add -A" at the repo root. The autosave hook may swallow your edits as 'wip: auto-save' commits — amend/squash on YOUR unpushed branch only. The sandbox refuses piped commands ("too complex to verify"): write plain forms. If your tree is dirty with someone else's changes, STOP and report.
SHIP: clean commit (message ends with "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"), push to the jicate remote, open a PR via gh to Jicate-Solutions/MyJKKN (body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)"). Open it READY when risky_assumptions is empty; open it as DRAFT (gh pr create --draft) when any [risky] assumption exists — the Director's answers flip it Ready (decision E6). Backend-only PRs get the visual-proof-skip label with a one-line justification comment.
RETURN: {pr_number, pr_url, head_sha, files_changed[], risky_assumptions[], surprises} — or {already_exists:true, where, surprises} when Step 0.5 found it.
`

const BUILT_SCHEMA = { type: 'object',
  properties: { pr_number: { type: 'number' }, pr_url: { type: 'string' }, head_sha: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    risky_assumptions: { type: 'array', items: { type: 'string' } },
    already_exists: { type: 'boolean' }, where: { type: 'string' }, surprises: { type: 'string' } } }

const VERDICT_SCHEMA = { type: 'object', required: ['ready', 'ci'],
  properties: { ready: { type: 'boolean' }, ci: { type: 'string' }, problems: { type: 'array', items: { type: 'string' } } } }

const SWEEP_SCHEMA = { type: 'object', required: ['ran'],
  properties: { ran: { type: 'boolean' }, reason: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } }, screenshots: { type: 'array', items: { type: 'string' } } } }

const MIRROR_SCHEMA = { type: 'object', required: ['exit_lines'],
  properties: { exit_lines: { type: 'array', items: { type: 'string' } }, all_green: { type: 'boolean' }, notes: { type: 'string' } } }

const RECONCILE_SCHEMA = { type: 'object', required: ['action'],
  properties: { action: { type: 'string' }, new_head_sha: { type: 'string' }, rebuttal: { type: 'string' } } }

const verifyA = (built, spec) => agent(
  `Verify PR #${built.pr_number} (${built.pr_url}) on Jicate-Solutions/MyJKKN as an adversarial reviewer. 1) gh pr view ${built.pr_number} --json headRefOid — confirm it matches ${built.head_sha}; read check-runs on THAT sha via gh api repos/Jicate-Solutions/MyJKKN/commits/${built.head_sha}/check-runs (never gh pr checks — it prints fail for cancelled/neutral) until nothing is pending; note that a DRAFT PR skips real gates — say so if the PR is draft. Blocking gates: TypeCheck, terminology, secdef-anon, lib unit tests. 2) gh pr diff — confirm the diff matches this spec and nothing more: ${spec.title} — ${spec.spec.slice(0, 400)}. 3) Try to REFUTE readiness: scope creep, missing SQL_FILE_INDEX line, applied-SQL claims, student-terminology, a described-not-pasted gate result, an assumption marked [safe] that is actually [risky]. Return verdict.`,
  { label: `verify-A:${built.pr_number}`, phase: 'Verify A', effort: 'high', schema: VERDICT_SCHEMA })

const verifyB = (built, spec, headSha, round) => agent(
  `You are the SECOND, independent reviewer of PR #${built.pr_number} (${built.pr_url}) on Jicate-Solutions/MyJKKN, deliberately on a different model than the builder — your job is the blind spots a same-model reviewer shares.${round ? ' This is your RE-LOOK after the builder responded to your first objections — judge the response on its merits.' : ''} Do NOT re-check CI status (reviewer A does that). Instead, in a fresh worktree of the PR head (${headSha}): a) BEHAVIOUR, not objects — for each new/changed function or route, state what a real user or cron would experience and whether the code actually does that (plpgsql bodies only fail at runtime: read every column the SQL touches against the migrations that define those tables on jicate/main, and flag any column that does not exist); b) GRANTS — every SECURITY DEFINER fn: is anon AND PUBLIC revoked, and who does 'authenticated' actually admit; c) MIGRATIONS — inner BEGIN/COMMIT that would defeat a rollback rehearsal, NOT-NULL columns a seed omits (ON CONFLICT cannot rescue a NOT-NULL violation), duplicate numeric prefixes vs main; d) the spec's stated constraints (${spec.spec.slice(0, 300)}) — anything crossed. Return verdict; problems must be specific (file:line, column, fn).`,
  { label: `verify-B${round ? '-relook' : ''}:${built.pr_number}`, phase: 'Verify B', model: 'opus', effort: 'high', schema: VERDICT_SCHEMA })

const tieBreak = (built, spec, headSha, objections, rebuttal) => agent(
  `You are the THIRD, tie-breaking reviewer of PR #${built.pr_number} (${built.pr_url}, head ${headSha}) on Jicate-Solutions/MyJKKN. Reviewer A says ready; reviewer B (Opus) still objects after the builder responded. B's standing objections:\n${objections.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nBuilder's response:\n${(rebuttal || '(none)').slice(0, 1500)}\nIn a fresh worktree of the head, check ONLY the disputed points against the actual code and main's migrations. Vote: ready=true if B's objections are wrong or already addressed; ready=false if any stands. Your problems[] must name which objection stands and why. Spec constraints: ${spec.spec.slice(0, 200)}`,
  { label: `tie-break(sonnet):${built.pr_number}`, phase: 'Tie-break', model: 'sonnet', effort: 'high', schema: VERDICT_SCHEMA })

const reconcile = (built, spec, problems) => agent(
  `Reviewer B (a different model) objected to PR #${built.pr_number} (${built.pr_url}, head ${built.head_sha}) on Jicate-Solutions/MyJKKN with these problems:\n${problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nIn a worktree of the PR branch (git fetch jicate ${spec.branch}; check it out; never force-push): for EACH problem either FIX it (minimal diff, same gates as the original build, commit + push to the same branch) or REBUT it with evidence (file:line, a migration on main, a runtime fact) if the objection is wrong. Never argue past evidence. Return {action:'fixed'|'rebutted'|'mixed', new_head_sha (if you pushed), rebuttal (the per-problem responses, verbatim for the reviewer)}.`,
  { label: `reconcile:${built.pr_number}`, phase: 'Reconcile', isolation: 'worktree', effort: 'high', schema: RECONCILE_SCHEMA })

const personaSweep = (built, spec) => agent(
  `OBSERVED-IDENTITY RULE: /auth/test-login Sign Out does NOT clear the 127.0.0.1 cookie jar, so a page can load as the previous persona. Before trusting any screenshot or click as persona X, read the identity the page actually shows (name / email / role badge, or /api/auth/me) and ASSERT it equals X; sign in explicitly for every persona; a mismatch is a FAILED sweep, never a pass. Model-driven persona browser sweep for PR #${built.pr_number} (head ${built.head_sha}) — the build-depth gate's Step 2.5b.

AUTHORIZATION FOR THIS LANE: prodAck = ${spec.prodAck ? 'TRUE' : 'FALSE'}.
${spec.prodAck
    ? 'prodAck is TRUE: the Director has explicitly authorized clicking through the site on the real database for THIS build. Even though .env.local points at production, you MUST run the sweep. Do not apply the not-browser-checked label. Skip the refusal branch entirely.'
    : 'prodAck is FALSE: do NOT sweep. Run exactly these two commands and return {ran:false, reason:\'prod-connected .env.local, no prodAck\'}: gh pr edit ' + built.pr_number + ' --repo Jicate-Solutions/MyJKKN --add-label not-browser-checked ; gh pr comment ' + built.pr_number + ' --repo Jicate-Solutions/MyJKKN --body "Persona browser sweep did not run: no prodAck for this lane. Code gates passed; the UI was NOT clicked through by the model." (create the label first if it does not exist).'}

SWEEP PROCEDURE (only when authorized): create a worktree of the PR head under .claude/worktrees/, symlink node_modules (ln -sfn ../../../node_modules node_modules), copy .env.local, and pick a FREE ad-hoc port from 3107 upward (3104 and 3106 are standing dev servers — check with lsof -i :PORT before starting) and start PORT=<port> npm run dev with the REAL service-role key per the repo CLAUDE.md pattern (SUPABASE_SERVICE_ROLE_KEY from .env.production.local); open pages on that same port. Then, using the connected Chrome via the workflow-test skill's Mode E (persona snapshot — session injection, NO password typing), open every changed page (gh pr diff ${built.pr_number} --name-only | grep page.tsx, plus any page that renders a changed component) as each of these personas: ${(spec.personas || ['superadmin', 'hod', 'faculty', 'student']).join(', ')}. On each page: click EVERY action (buttons, menus, tabs, rows), confirm each expected state change, read the Next.js DevTools Issues badge, and screenshot before/after into .screenshots/ (git add -f). Report every broken action, silent no-op, permission bounce that is not an explicit denial (rule #27), console error, and issues-badge increase as a finding. Stop the dev server and remove the worktree when done. Never claim a page was swept if it was not opened.`,
  { label: `persona-sweep:${built.pr_number}`, phase: 'Persona sweep', effort: 'high', schema: SWEEP_SCHEMA })

const gateMirror = (built) => agent(
  `Cheap-mode TRIAL (low effort, mechanical): in a fresh worktree of PR #${built.pr_number} head ${built.head_sha} (git fetch jicate; git worktree add), symlink node_modules and run, one at a time, pasting each exit line verbatim: bash scripts/ci/check-nav-config-hrefs.sh; bash scripts/ci/check-radix-select-empty-values.sh; node scripts/check-permissions-catalog.mjs; and confirm every file under supabase/migrations/ in the PR diff has a matching line in supabase/SQL_FILE_INDEX.md (grep the filename). Remove the worktree when done. Return {exit_lines[], all_green, notes}. Do not reason about the code; run the commands and report.`,
  { label: `gate-mirror(low):${built.pr_number}`, phase: 'Gate mirror (cheap trial)', effort: 'low', schema: MIRROR_SCHEMA })

const results = await pipeline(
  args,
  (spec) =>
    agent(
      `You build ONE production PR for Jicate-Solutions/MyJKKN in your git worktree — unattended, end to end.\n${BUILD_BOILERPLATE.replace('<BRANCH>', spec.branch)}\nBRANCH: ${spec.branch}\nTITLE: ${spec.title}\nprodAck: ${spec.prodAck ? 'true' : 'false'}\nSPEC:\n${spec.spec}`,
      { label: `build:${spec.branch}`, phase: 'Build', isolation: 'worktree', effort: 'high', schema: BUILT_SCHEMA },
    ),
  async (built, spec) => {
    if (!built) return null
    if (built.already_exists) {
      log(`lane ${spec.branch}: STOPPED — already exists at ${built.where}. Director decides.`)
      return { branch: spec.branch, already_exists: true, where: built.where, surprises: built.surprises }
    }
    if (!built.pr_number) {
      log(`lane ${spec.branch}: builder returned no PR and no already-exists finding — treat as failed`)
      return { branch: spec.branch, failed: true, surprises: built.surprises }
    }
    const thunks = [() => verifyA(built, spec), () => verifyB(built, spec, built.head_sha, 0)]
    if (spec.uiSweep) thunks.push(() => personaSweep(built, spec))
    if (spec.cheapTrial) thunks.push(() => gateMirror(built))
    const [a, b0, s, m] = await parallel(thunks)
    let b = b0
    let reconciled = null
    let tie = null
    // E1: a disagreement blocks until fixed or explained — one reconcile round, then B re-looks.
    if (a?.ready && b && !b.ready && (b.problems || []).length) {
      reconciled = await reconcile(built, spec, b.problems)
      const head = reconciled?.new_head_sha || built.head_sha
      b = await verifyB(built, spec, head, 1)
      if (reconciled?.new_head_sha) built.head_sha = reconciled.new_head_sha
      // E7: still disagreeing after the fix round — a third brain votes; majority decides.
      if (a?.ready && b && !b.ready) {
        tie = await tieBreak(built, spec, built.head_sha, b.problems || [], reconciled?.rebuttal)
        log(`tie-break for #${built.pr_number}: sonnet says ready=${tie?.ready}`)
      }
    }
    const problems = [...(a?.problems || []), ...(b?.problems || []).map(p => `[B/opus] ${p}`)]
    if (tie && !tie.ready) problems.push(...(tie.problems || []).map(p => `[tie-break/sonnet upheld] ${p}`))
    let sweep = null
    if (spec.uiSweep) {
      sweep = s || { ran: false, reason: 'sweep agent returned nothing' }
      if (!sweep.ran) log(`persona sweep for #${built.pr_number} did NOT run: ${sweep.reason} — PR labelled not-browser-checked; the scripted Step 2.5 delta is the only browser evidence`)
      for (const f of (sweep.findings || [])) problems.push(`[persona-sweep] ${f}`)
    }
    if (spec.cheapTrial && m) log(`cheap-mode trial for #${built.pr_number}: all_green=${m.all_green} — ${(m.exit_lines || []).join(' | ')}`)
    const reviewersAgree = !!(a?.ready && (b?.ready || (tie && tie.ready)))
    const ready = reviewersAgree && (!sweep || !sweep.ran || (sweep.findings || []).length === 0)
    return { ...built, verify: { ready, ciA: a?.ci, ciB: b?.ci, tieBreak: tie, problems, sweep, reconciled, cheapTrial: m || null }, risky_assumptions: built.risky_assumptions || [] }
  },
)

const shipped = results.filter(Boolean)
const opened = shipped.filter(r => r.pr_number)
const stopped = shipped.filter(r => r.already_exists)
const risky = opened.flatMap(r => (r.risky_assumptions || []).map(a => `#${r.pr_number}: ${a}`))
const drafts = opened.filter(r => (r.risky_assumptions || []).length > 0).map(r => r.pr_number)
log(`${opened.length}/${args.length} PRs opened; ${opened.filter((r) => r.verify?.ready).length} reviewer-ready; ${stopped.length} stopped (already exists); ${risky.length} risky assumption(s) → Director tap-questions, 3 per round, before PRs ${drafts.join(', ') || '(none)'} flip from Draft`)
return { shipped: opened, stopped, risky_assumptions: risky, draft_prs: drafts }
