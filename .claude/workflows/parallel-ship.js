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

// ── unwrap: the harness sometimes hands a structured agent result back as
//    {input:'<json string>'} instead of the parsed object (observed in run
//    wf_a577e9cc-b67). NO schema in this file declares an `input` property, so an
//    `input` string on an agent result means the wrapper is present, whatever
//    the payload's own shape — which is why this does not gate on pr_number: a wrapped
//    {already_exists}, a wrapped verdict and a wrapped reconcile result carry no
//    pr_number either. A payload that is not a plain object (JSON.parse('null')
//    returns null, JSON.parse('7') a number) is left wrapped so the caller's
//    existing "no PR / no verdict" paths handle it instead of throwing.
const unwrap = (r) => {
  if (!r || typeof r !== 'object' || typeof r.input !== 'string') return r
  try {
    const parsed = JSON.parse(r.input)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    log(`agent result looked wrapped ({input:string}) but its payload is not an object — left as-is`)
  } catch (e) {
    log(`agent result looked wrapped ({input:string}) but did not parse as JSON — ${String((e && e.message) || e)}`)
  }
  return r
}

// Every agent() result in this script goes through unwrap. Nothing makes the
// build call site special: the same wrapping around `reconcile` would leave
// new_head_sha undefined and point verify-B's re-look AND the Sonnet tie-break at
// the STALE head while the builder had already pushed a new one.
const call = async (prompt, opts) => unwrap(await agent(prompt, opts))

const verifyA = (built, spec) => call(
  `Verify PR #${built.pr_number} (${built.pr_url}) on Jicate-Solutions/MyJKKN as an adversarial reviewer. 1) gh pr view ${built.pr_number} --json headRefOid — confirm it matches ${built.head_sha}; read check-runs on THAT sha via gh api repos/Jicate-Solutions/MyJKKN/commits/${built.head_sha}/check-runs (never gh pr checks — it prints fail for cancelled/neutral) until nothing is pending; note that a DRAFT PR skips real gates — say so if the PR is draft. Blocking gates: TypeCheck, terminology, secdef-anon, lib unit tests. 2) gh pr diff — confirm the diff matches this spec and nothing more: ${spec.title} — ${spec.spec.slice(0, 400)}. 3) Try to REFUTE readiness: scope creep, missing SQL_FILE_INDEX line, applied-SQL claims, student-terminology, a described-not-pasted gate result, an assumption marked [safe] that is actually [risky]. Return verdict.`,
  { label: `verify-A:${built.pr_number}`, phase: 'Verify A', effort: 'high', schema: VERDICT_SCHEMA })

const verifyB = (built, spec, headSha, round) => call(
  `You are the SECOND, independent reviewer of PR #${built.pr_number} (${built.pr_url}) on Jicate-Solutions/MyJKKN, deliberately on a different model than the builder — your job is the blind spots a same-model reviewer shares.${round ? ' This is your RE-LOOK after the builder responded to your first objections — judge the response on its merits.' : ''} Do NOT re-check CI status (reviewer A does that). Instead, in a fresh worktree of the PR head (${headSha}): a) BEHAVIOUR, not objects — for each new/changed function or route, state what a real user or cron would experience and whether the code actually does that (plpgsql bodies only fail at runtime: read every column the SQL touches against the migrations that define those tables on jicate/main, and flag any column that does not exist); b) GRANTS — every SECURITY DEFINER fn: is anon AND PUBLIC revoked, and who does 'authenticated' actually admit; c) MIGRATIONS — inner BEGIN/COMMIT that would defeat a rollback rehearsal, NOT-NULL columns a seed omits (ON CONFLICT cannot rescue a NOT-NULL violation), duplicate numeric prefixes vs main; d) the spec's stated constraints (${spec.spec.slice(0, 300)}) — anything crossed. Return verdict; problems must be specific (file:line, column, fn).`,
  { label: `verify-B${round ? '-relook' : ''}:${built.pr_number}`, phase: 'Verify B', model: 'opus', effort: 'high', schema: VERDICT_SCHEMA })

const tieBreak = (built, spec, headSha, objections, rebuttal) => call(
  `You are the THIRD, tie-breaking reviewer of PR #${built.pr_number} (${built.pr_url}, head ${headSha}) on Jicate-Solutions/MyJKKN. Reviewer A says ready; reviewer B (Opus) still objects after the builder responded. B's standing objections:\n${objections.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nBuilder's response:\n${(rebuttal || '(none)').slice(0, 1500)}\nIn a fresh worktree of the head, check ONLY the disputed points against the actual code and main's migrations. Vote: ready=true if B's objections are wrong or already addressed; ready=false if any stands. Your problems[] must name which objection stands and why. Spec constraints: ${spec.spec.slice(0, 200)}`,
  { label: `tie-break(sonnet):${built.pr_number}`, phase: 'Tie-break', model: 'sonnet', effort: 'high', schema: VERDICT_SCHEMA })

const reconcile = (built, spec, problems) => call(
  `Reviewer B (a different model) objected to PR #${built.pr_number} (${built.pr_url}, head ${built.head_sha}) on Jicate-Solutions/MyJKKN with these problems:\n${problems.map((p, i) => `${i + 1}. ${p}`).join('\n')}\nIn a worktree of the PR branch (git fetch jicate ${spec.branch}; check it out; never force-push): for EACH problem either FIX it (minimal diff, same gates as the original build, commit + push to the same branch) or REBUT it with evidence (file:line, a migration on main, a runtime fact) if the objection is wrong. Never argue past evidence. Return {action:'fixed'|'rebutted'|'mixed', new_head_sha (if you pushed), rebuttal (the per-problem responses, verbatim for the reviewer)}.`,
  { label: `reconcile:${built.pr_number}`, phase: 'Reconcile', isolation: 'worktree', effort: 'high', schema: RECONCILE_SCHEMA })

const personaSweep = (built, spec) => call(
  `OBSERVED-IDENTITY RULE: /auth/test-login Sign Out does NOT clear the 127.0.0.1 cookie jar, so a page can load as the previous persona. Before trusting any screenshot or click as persona X, read the identity the page actually shows (name / email / role badge, or /api/auth/me) and ASSERT it equals X; sign in explicitly for every persona; a mismatch is a FAILED sweep, never a pass. Model-driven persona browser sweep for PR #${built.pr_number} (head ${built.head_sha}) — the build-depth gate's Step 2.5b.

AUTHORIZATION FOR THIS LANE: prodAck = ${spec.prodAck ? 'TRUE' : 'FALSE'}.
${spec.prodAck
    ? 'prodAck is TRUE: the Director has explicitly authorized clicking through the site on the real database for THIS build. Even though .env.local points at production, you MUST run the sweep. Do not apply the not-browser-checked label. Skip the refusal branch entirely.'
    : 'prodAck is FALSE: do NOT sweep. Run exactly these two commands and return {ran:false, reason:\'prod-connected .env.local, no prodAck\'}: gh pr edit ' + built.pr_number + ' --repo Jicate-Solutions/MyJKKN --add-label not-browser-checked ; gh pr comment ' + built.pr_number + ' --repo Jicate-Solutions/MyJKKN --body "Persona browser sweep did not run: no prodAck for this lane. Code gates passed; the UI was NOT clicked through by the model." (create the label first if it does not exist).'}

SWEEP PROCEDURE (only when authorized): create a worktree of the PR head under .claude/worktrees/, symlink node_modules (ln -sfn ../../../node_modules node_modules), copy .env.local, and pick a FREE ad-hoc port from 3107 upward (3104 and 3106 are standing dev servers — check with lsof -i :PORT before starting) and start PORT=<port> npm run dev with the REAL service-role key per the repo CLAUDE.md pattern (SUPABASE_SERVICE_ROLE_KEY from .env.production.local); open pages on that same port. Then, using the connected Chrome via the workflow-test skill's Mode E (persona snapshot — session injection, NO password typing), open every changed page (gh pr diff ${built.pr_number} --name-only | grep page.tsx, plus any page that renders a changed component) as each of these personas: ${(spec.personas || ['superadmin', 'hod', 'faculty', 'student']).join(', ')}. On each page: click EVERY action (buttons, menus, tabs, rows), confirm each expected state change, read the Next.js DevTools Issues badge, and screenshot before/after into .screenshots/ (git add -f). Report every broken action, silent no-op, permission bounce that is not an explicit denial (rule #27), console error, and issues-badge increase as a finding. Stop the dev server and remove the worktree when done. Never claim a page was swept if it was not opened.`,
  { label: `persona-sweep:${built.pr_number}`, phase: 'Persona sweep', effort: 'high', schema: SWEEP_SCHEMA })

const gateMirror = (built) => call(
  `Cheap-mode TRIAL (low effort, mechanical): in a fresh worktree of PR #${built.pr_number} head ${built.head_sha} (git fetch jicate; git worktree add), symlink node_modules and run, one at a time, pasting each exit line verbatim: bash scripts/ci/check-nav-config-hrefs.sh; bash scripts/ci/check-radix-select-empty-values.sh; node scripts/check-permissions-catalog.mjs; and confirm every file under supabase/migrations/ in the PR diff has a matching line in supabase/SQL_FILE_INDEX.md (grep the filename). Remove the worktree when done. Return {exit_lines[], all_green, notes}. Do not reason about the code; run the commands and report.`,
  { label: `gate-mirror(low):${built.pr_number}`, phase: 'Gate mirror (cheap trial)', effort: 'low', schema: MIRROR_SCHEMA })

// ── Three failure modes this script used to swallow (2026-09-18) ─────────────
// (1) WRAPPED AGENT RESULT — see unwrap() / call() above. Run wf_a577e9cc-b67:
//     the harness handed the builder's structured result back as
//     {input:'<json string>'} instead of the parsed object. `built.pr_number` was
//     undefined, the lane logged "builder returned no PR", and verify-A /
//     verify-B / the gate mirror were SILENTLY skipped while Draft PR #3883
//     existed — the two-reviewer gate was bypassed with nothing red anywhere.
// (2) USAGE-LIMIT DEATH (G5, Director ruling 2026-09-16, rank 5). When a lane's
//     agent dies on a usage limit whose text names a reset time, the orchestrator
//     wants a one-shot resume — but this script can neither create a cron nor
//     read the clock. So it makes the failure VISIBLE and PARSEABLE instead: one
//     `USAGE-LIMIT-RESET:` log line carrying the matched time text, and a lane
//     result of {failed, usage_limit, reset_hint} that survives into the final
//     summary. A lane fires ONE build agent and up to SEVEN more (verify-A,
//     verify-B, persona sweep, gate mirror, reconcile, verify-B re-look,
//     tie-break), and only THREE of those are awaited directly — the other four
//     go through parallel(), which is documented to convert a throwing thunk to
//     `null` and never reject, so no try/catch around the parallel() call can
//     ever see them. caught() captures those four in band; everything else
//     propagates to the lane's own catch. NOTHING is re-raised past the lane: a
//     pipeline() stage that throws drops its item to null and filter(Boolean)
//     deletes it, so a rethrow erases the lane — PR number and all — from every
//     field of the return value.
// (3) AN INVISIBLE FAILED LANE. A lane whose builder returned no PR was logged
//     and then appeared in NO field of the return value — the exact shape that
//     hid the #3883 bypass from this script's caller. It now returns as failed[].
//
// The classifier requires a QUOTA word. A bare `limit` also matches GitHub's
// `API rate limit exceeded for user; please try again later`, which is an
// immediately-retryable 429: reporting it as a usage limit tells the Director to
// wait for a reset that never arrives AND hides a retryable error.
//
// A bare `quota` is MyJKKN domain vocabulary, not an exhaustion signal: 39 files
// on jicate/main carry it (admission quotas under app/(routes)/admission/settings/
// lookups/quotas/, campus-living quota eligibility) and `quotation` matches it as
// a substring, so "lane admission-quota-seats: build failed" and "procurement
// quotation compare crashed" both classified as usage limits. `quota` therefore
// only counts when an exhaustion word sits beside it — which is how every real
// quota message reads ("quota exceeded", "you have exceeded your quota").
const USAGE_LIMIT_RE = /usage limit|resets? (at|in)|reached your [^.\n]{0,40}\blimit\b|\bquota\b[^.\n]{0,20}\b(exceeded|reached|exhausted|remaining|limit)\b|\b(exceeded|exhausted|out of|remaining|reached)\b[^.\n]{0,20}\bquota\b/i

// The reset time routinely lands in a SECOND sentence or on the next line
// ("Usage limit reached.\nYour limit resets at 2:00 PM."), so the hint is a
// window of the whitespace-flattened message around the first quota token.
// Sentence-and-line-bounded matching drops exactly the time this exists to name.
const usageLimitInfo = (e) => {
  const text = String((e && e.message) || e || '')
  if (!USAGE_LIMIT_RE.test(text)) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  const at = flat.search(/quota|limit|resets?|try again/i)
  const from = Math.max(0, at < 0 ? 0 : at - 40)
  return { usage_limit: true, reset_hint: flat.slice(from, from + 240).trim() }
}

const errText = (e) => String((e && e.message) || e || 'unknown error')

// One failure line must stay ONE readable line. An agent's error text can carry a
// whole stack trace, and an unclipped copy of it in the summary pushed the field
// that actually decides — the branch name — off the end of the line.
const clip = (s, n = 200) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

// parallel() is documented to swallow a throwing thunk into `null` ("the call
// itself never rejects"), so an error inside verify-A, verify-B round 0, the
// persona sweep or the gate mirror can NEVER reach a try/catch around the
// parallel() call. Capture it IN BAND instead and let the caller decide.
const caught = (fn) => async () => {
  try { return await fn() }
  catch (e) { return { __threw: errText(e), ...(usageLimitInfo(e) || {}) } }
}

// NOTHING in a lane may throw past this point. pipeline() is documented to drop a
// throwing stage's item to `null` and skip its remaining stages, and the
// `results.filter(Boolean)` below then deletes it — so a re-raised error erases
// the lane from EVERY field of the return value, which is the exact invisible-lane
// shape this script exists to close. An unclassified error is a failed lane with
// its text, never a rethrow.
const buildLane = async (spec) => {
  try {
    return await call(
      `You build ONE production PR for Jicate-Solutions/MyJKKN in your git worktree — unattended, end to end.\n${BUILD_BOILERPLATE.replace('<BRANCH>', spec.branch)}\nBRANCH: ${spec.branch}\nTITLE: ${spec.title}\nprodAck: ${spec.prodAck ? 'true' : 'false'}\nSPEC:\n${spec.spec}`,
      { label: `build:${spec.branch}`, phase: 'Build', isolation: 'worktree', effort: 'high', schema: BUILT_SCHEMA },
    )
  } catch (e) {
    const u = usageLimitInfo(e)
    if (u) {
      log(`USAGE-LIMIT-RESET: ${u.reset_hint} — resume with Workflow({scriptPath, resumeFromRunId})`)
      return { branch: spec.branch, failed: true, ...u }
    }
    // ONE line, clipped: the lane must be nameable in the summary even when the
    // builder dies with a stack trace attached.
    const why = clip(errText(e))
    log(`lane ${spec.branch}: build threw — ${why}`)
    return { branch: spec.branch, failed: true, error: why, surprises: `build agent threw: ${why}` }
  }
}

const verifyLane = async (built, spec) => {
    // Results are indexed BY NAME, never by position. Two of these four stages are
    // optional and independently so, so the array's shape is not fixed: with
    // cheapTrial:true and uiSweep:false the thunks are [A, B, gate-mirror] and a
    // positional `const [a, b0, s, m] =` bound the gate-mirror result to `s` and
    // left `m` undefined — the cheap-mode measurement was then silently dropped
    // (no log line, cheapTrial:null) while the lane reported perfectly healthy.
    const stages = [
      { name: 'verify-A', run: () => verifyA(built, spec) },
      { name: 'verify-B', run: () => verifyB(built, spec, built.head_sha, 0) },
    ]
    if (spec.uiSweep) stages.push({ name: 'persona sweep', run: () => personaSweep(built, spec) })
    if (spec.cheapTrial) stages.push({ name: 'gate mirror', run: () => gateMirror(built) })
    const threw = []
    const byStage = new Map()
    ;(await parallel(stages.map((st) => caught(st.run)))).forEach((r, i) => {
      const name = stages[i].name
      if (r && r.__threw) { threw.push({ stage: name, ...r }); byStage.set(name, null); return }
      byStage.set(name, r)
    })
    // `byStage.has(name)` = the stage was REQUESTED; its value null = it was requested
    // and reported nothing. The two are different facts and must not collapse.
    const a = byStage.get('verify-A')
    const b0 = byStage.get('verify-B')
    const s = byStage.has('persona sweep') ? byStage.get('persona sweep') : undefined
    const m = byStage.has('gate mirror') ? byStage.get('gate mirror') : undefined
    // A usage limit inside any of those four can never surface on its own (see
    // caught()). Re-raise it here, where the lane's own catch — which already
    // knows the PR exists — turns it into {usage_limit, reset_hint} instead of a
    // lane that silently reads "0 reviewer-ready" with an EMPTY problems[].
    const limited = threw.find((t) => t.usage_limit)
    if (limited) throw new Error(`${limited.stage}: ${limited.__threw}`)
    for (const t of threw) log(`lane ${spec.branch}: ${t.stage} for #${built.pr_number} threw — ${t.__threw}`)
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
    // A reviewer that resolves null (agent() does that when the subagent dies on a
    // terminal API error after retries, or the user skips it) left `ready` false
    // with an EMPTY problems[] — a dead reviewer indistinguishable from a silent
    // one, i.e. the same count-only signal that hid the #3883 bypass. The persona
    // sweep already had this guard; the two reviewers that actually gate readiness
    // did not.
    for (const t of threw) problems.push(`[${t.stage}] stage threw, verdict NOT obtained: ${t.__threw}`)
    const dead = new Set(threw.map((t) => t.stage))
    if (!a && !dead.has('verify-A')) {
      const msg = `#${built.pr_number}: reviewer A returned nothing (died or skipped) — NOT reviewer-ready`
      log(`lane ${spec.branch}: ${msg}`)
      problems.push(`[verify-A] ${msg}`)
    }
    if (!b && !dead.has('verify-B')) {
      const msg = `#${built.pr_number}: reviewer B returned nothing (died or skipped) — NOT reviewer-ready`
      log(`lane ${spec.branch}: ${msg}`)
      problems.push(`[B/opus] ${msg}`)
    }
    let sweep = null
    // A CRASHED sweep is not decision E4. E4 is a REPORTED refusal: the agent ran,
    // said {ran:false, reason:'…no prodAck'} and applied the not-browser-checked
    // label itself — a known-unswept UI ships Ready by the Director's ruling. A
    // sweep that returned nothing or threw reported NOTHING: it never reached the
    // label step, so the PR carries no not-browser-checked mark, and the UI state
    // is unknown rather than known-unswept. Ready would be a claim nobody made.
    let sweepCrashed = false
    if (spec.uiSweep) {
      const sweepThrew = threw.find((t) => t.stage === 'persona sweep')
      if (!s) {
        sweepCrashed = true
        const why = sweepThrew ? `sweep agent threw: ${clip(sweepThrew.__threw)}` : 'sweep agent returned nothing (died or skipped)'
        const msg = sweepThrew
          ? `#${built.pr_number}: persona sweep threw — NOT reviewer-ready; no not-browser-checked label was applied`
          : `#${built.pr_number}: persona sweep returned nothing (died or skipped) — NOT reviewer-ready; no not-browser-checked label was applied`
        sweep = { ran: false, crashed: true, reason: why }
        log(`lane ${spec.branch}: ${msg} — ${why}`)
        problems.push(`[persona-sweep] ${msg} (${why})`)
      } else {
        sweep = s
        if (!sweep.ran) log(`persona sweep for #${built.pr_number} did NOT run: ${sweep.reason} — PR labelled not-browser-checked; the scripted Step 2.5 delta is the only browser evidence`)
      }
      for (const f of (sweep.findings || [])) problems.push(`[persona-sweep] ${f}`)
    }
    // The gate mirror MEASURES cheap mode; it does not gate readiness. But a
    // measurement that vanished is indistinguishable from one that was never asked
    // for, which is how the positional-destructuring bug above stayed invisible.
    if (spec.cheapTrial) {
      if (m) log(`cheap-mode trial for #${built.pr_number}: all_green=${m.all_green} — ${(m.exit_lines || []).join(' | ')}`)
      else log(`lane ${spec.branch}: cheap-mode trial for #${built.pr_number} returned nothing (died or skipped) — no cheap-mode measurement for this lane; readiness is unaffected`)
    }
    const reviewersAgree = !!(a?.ready && (b?.ready || (tie && tie.ready)))
    const ready = reviewersAgree && !sweepCrashed && (!sweep || !sweep.ran || (sweep.findings || []).length === 0)
    return { ...built, verify: { ready, ciA: a?.ci, ciB: b?.ci, tieBreak: tie, problems, sweep, reconciled, cheapTrial: m || null }, risky_assumptions: built.risky_assumptions || [] }
}

const results = await pipeline(
  args,
  (spec) => buildLane(spec),
  async (built, spec) => {
    // A builder that RESOLVES with nothing (rather than throwing) used to return
    // null here and be deleted by results.filter(Boolean) below — the lane's
    // branch then appeared in NO field of the return value and the summary read
    // only "N/M PRs opened", the identical count-only signal that hid the #3883
    // bypass. Surface it as a failed lane instead.
    if (!built) {
      // agent() is documented to RESOLVE null — not throw — when the user skips it
      // or the subagent dies on a terminal API error after retries. A usage limit
      // that arrives down that path carries no error text, so no reset time can
      // honestly be named; say that rather than leave a bare "returned nothing".
      log(`lane ${spec.branch}: build agent returned nothing (resolved null — skipped, or a terminal API error such as a usage limit, which the harness surfaces with no error text) — treat as failed; no reset time can be named`)
      return { branch: spec.branch, failed: true,
        surprises: 'builder agent returned nothing (resolved null: skipped or a terminal API error after retries) — no error text, so no usage-limit reset time is available' }
    }
    built = unwrap(built)
    // a usage-limit death passes straight through to the summary
    if (built.usage_limit) {
      log(`lane ${spec.branch}: build agent hit a usage limit — reset hint: ${built.reset_hint}`)
      return built
    }
    // buildLane already logged the reason and shaped the lane — passing it through
    // the "no PR" branch below would re-log a vaguer one over the real error text.
    if (built.failed) return built
    if (built.already_exists) {
      log(`lane ${spec.branch}: STOPPED — already exists at ${built.where}. Director decides.`)
      return { branch: spec.branch, already_exists: true, where: built.where, surprises: built.surprises }
    }
    if (!built.pr_number) {
      log(`lane ${spec.branch}: builder returned no PR and no already-exists finding — treat as failed`)
      return { branch: spec.branch, failed: true, surprises: built.surprises }
    }
    try {
      return await verifyLane(built, spec)
    } catch (e) {
      const u = usageLimitInfo(e)
      if (u) {
        log(`USAGE-LIMIT-RESET: ${u.reset_hint} — resume with Workflow({scriptPath, resumeFromRunId})`)
        log(`lane ${spec.branch}: verification of #${built.pr_number} died on a usage limit — the PR exists and is NOT reviewer-ready`)
        return { ...built, branch: spec.branch, failed: true, ...u, risky_assumptions: built.risky_assumptions || [],
          verify: { ready: false, problems: [`verification did not finish — usage limit: ${u.reset_hint}`] } }
      }
      // Re-raising here deleted a lane whose PR was ALREADY OPENED: pipeline()
      // drops a throwing stage's item to null and filter(Boolean) removes it, so
      // the PR number vanished from every field of the return value.
      log(`lane ${spec.branch}: verification of #${built.pr_number} threw — ${errText(e)} — the PR exists and is NOT reviewer-ready`)
      return { ...built, branch: spec.branch, failed: true, surprises: `verification threw: ${errText(e)}`,
        risky_assumptions: built.risky_assumptions || [],
        verify: { ready: false, problems: [`verification did not finish — ${errText(e)}`] } }
    }
  },
)

const shipped = results.filter(Boolean)
const opened = shipped.filter(r => r.pr_number)
const stopped = shipped.filter(r => r.already_exists)
const usageLimited = shipped.filter(r => r.usage_limit)
// a plain build failure used to appear in NO field of the return value
const failed = shipped.filter(r => r.failed && !r.usage_limit)
const risky = opened.flatMap(r => (r.risky_assumptions || []).map(a => `#${r.pr_number}: ${a}`))
const drafts = opened.filter(r => (r.risky_assumptions || []).length > 0).map(r => r.pr_number)
log(`${opened.length}/${args.length} PRs opened; ${opened.filter((r) => r.verify?.ready).length} reviewer-ready; ${stopped.length} stopped (already exists); ${risky.length} risky assumption(s) → Director tap-questions, 3 per round, before PRs ${drafts.join(', ') || '(none)'} flip from Draft${failed.length ? `; ${failed.length} lane(s) failed — ${failed.map(r => `${r.branch}: ${clip(r.error || r.surprises || '(no reason given)')}`).join(' | ')}` : ''}${usageLimited.length ? `; ${usageLimited.length} lane(s) died on a usage limit — ${usageLimited.map(r => `${r.branch}: ${r.reset_hint}`).join(' | ')}` : ''}`)
// a usage-limited lane that had already opened its PR appears in BOTH shipped
// (with verify.ready false) and usage_limited — deliberately, so neither the PR
// nor the reason verification stopped can go missing from the summary.
return { shipped: opened, stopped, failed, usage_limited: usageLimited, risky_assumptions: risky, draft_prs: drafts }
