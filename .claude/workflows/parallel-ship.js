export const meta = {
  name: 'parallel-ship',
  description: 'Fan out independent MyJKKN build specs as parallel worktree builder agents, each with a verifier-on-edge watching its PR CI',
  whenToUse: 'When 2+ independent (different-files) MyJKKN changes should each become a jicate/main worktree PR concurrently. args = [{branch, title, spec}, ...]. Branch names must not contain "main".',
  phases: [
    { title: 'Build', detail: 'one builder agent per spec, isolated worktree' },
    { title: 'Verify', detail: 'one verifier per opened PR — CI on head sha + diff-vs-spec' },
  ],
}

// args: array of { branch: string, title: string, spec: string }
if (!Array.isArray(args) || args.length === 0) {
  throw new Error('parallel-ship needs args = [{branch, title, spec}, ...]')
}
for (const s of args) {
  if (!s.branch || /main/.test(s.branch)) throw new Error(`bad branch name (empty or contains "main"): ${s.branch}`)
}

const BUILD_BOILERPLATE = `
STEP 0 (MANDATORY): git fetch jicate main && git checkout -B <BRANCH> jicate/main; verify git log -1 matches jicate/main head. The default worktree base is a 720-commit-diverged local branch — building on it is fatal.
GATES: terminology "learner" never "student"; no console.log; minimal traceable diff; migrations are FILES ONLY (never applied — Director-gated); every CREATE OR REPLACE of a SECDEF fn re-asserts REVOKE FROM anon, PUBLIC in the same file; SQL_FILE_INDEX.md gets one appended line per new migration.
GIT SAFETY (workers run in PARALLEL against a SHARED repo — these are absolute): NEVER git stash / git stash pop (the stash is global: popping can steal ANOTHER worker's work — this has already happened here once). NEVER git reset --hard, git clean -f, or any command that discards a working tree. NEVER force-push, and never push to a branch that is not yours. Stage and commit only the specific files YOUR spec required — never "git add -A" at the repo root. If your tree is dirty with someone else's changes, STOP and report; do not "clean it up".
SHIP: clean commit (message ends with "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"), push to the jicate remote, open a READY PR via gh to Jicate-Solutions/MyJKKN (body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)").
RETURN: {pr_number, pr_url, head_sha, files_changed[], surprises}.
`

const results = await pipeline(
  args,
  (spec) =>
    agent(
      `You build ONE production PR for Jicate-Solutions/MyJKKN in your git worktree.\n${BUILD_BOILERPLATE.replace('<BRANCH>', spec.branch)}\nBRANCH: ${spec.branch}\nTITLE: ${spec.title}\nSPEC:\n${spec.spec}`,
      { label: `build:${spec.branch}`, phase: 'Build', isolation: 'worktree',
        schema: { type: 'object', required: ['pr_number', 'pr_url', 'head_sha'],
          properties: { pr_number: { type: 'number' }, pr_url: { type: 'string' }, head_sha: { type: 'string' },
            files_changed: { type: 'array', items: { type: 'string' } }, surprises: { type: 'string' } } } },
    ),
  (built, spec) =>
    built &&
    agent(
      `Verify PR #${built.pr_number} (${built.pr_url}) on Jicate-Solutions/MyJKKN as an adversarial reviewer. 1) gh pr view ${built.pr_number} --json headRefOid — confirm it matches ${built.head_sha}; watch CI check-runs on THAT sha until blocking checks conclude (TypeCheck, terminology, secdef-anon gate). 2) gh pr diff — confirm the diff matches this spec and nothing more: ${spec.title} — ${spec.spec.slice(0, 400)}. 3) Try to REFUTE readiness: scope creep, missing SQL_FILE_INDEX line, applied-SQL claims, student-terminology. Return verdict.`,
      { label: `verify:${built.pr_number}`, phase: 'Verify',
        schema: { type: 'object', required: ['ready', 'ci'],
          properties: { ready: { type: 'boolean' }, ci: { type: 'string' }, problems: { type: 'array', items: { type: 'string' } } } } },
    ).then((v) => ({ ...built, verify: v })),
)

const shipped = results.filter(Boolean)
log(`${shipped.length}/${args.length} PRs opened; ${shipped.filter((r) => r.verify?.ready).length} verified ready`)
return shipped
