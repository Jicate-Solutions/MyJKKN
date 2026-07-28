export const meta = {
  name: 'bug-sweep-until-dry',
  description: 'Loop-until-dry bug hunt over a scoped MyJKKN area: parallel finder lenses, dedupe vs seen, 3-lens adversarial verify, stop after 2 dry rounds',
  whenToUse: 'Exhaustive "find all real bugs in <area>" sweeps where the count is unknown. args = { scope: "path or module description", maxRounds?: number }. Read-only — reports confirmed bugs; fixing is a separate step.',
  phases: [
    { title: 'Find', detail: 'four lenses per round: correctness, RLS/auth, state/async, data-shape' },
    { title: 'Verify', detail: 'each fresh finding judged by 3 lenses; ≥2 must confirm' },
  ],
}

const scope = args?.scope
if (!scope) throw new Error('bug-sweep-until-dry needs args = { scope }')
const maxRounds = args?.maxRounds ?? 6

const LENSES = [
  { key: 'correctness', prompt: 'logic errors, wrong joins (!inner dropping rows), off-by-one, wrong table/column' },
  { key: 'rls-auth', prompt: 'RLS gaps (missing UPDATE policy silent no-op, FOR ALL policies, anon EXECUTE grants), permission checks by key-existence instead of value' },
  { key: 'state-async', prompt: 'loading-state races (?? false hiding loading), inline array props re-triggering fetch hooks, stale closures, return-null layout shift' },
  { key: 'data-shape', prompt: 'JSONB array-vs-object handling, enum/CHECK widenings missing TS union sweep, nullable FK assumptions' },
]

const BUGS = { type: 'object', required: ['bugs'], properties: { bugs: { type: 'array', items: { type: 'object', required: ['file', 'line', 'desc'], properties: { file: { type: 'string' }, line: { type: 'number' }, desc: { type: 'string' }, severity: { type: 'string' } } } } } }
const VERDICT = { type: 'object', required: ['real'], properties: { real: { type: 'boolean' }, reason: { type: 'string' } } }

const key = (b) => `${b.file}:${b.line}:${b.desc.slice(0, 60)}`
const seen = new Set()
const confirmed = []
let dry = 0, round = 0

while (dry < 2 && round < maxRounds) {
  round++
  const found = (
    await parallel(
      LENSES.map((l) => () =>
        agent(
          `Read-only bug hunt round ${round} in the MyJKKN repo (READ code via git show jicate/main:<path> or the working tree — never build on the local diverged branch). SCOPE: ${scope}. LENS (${l.key}): ${l.prompt}. Report only defects you can point to at file:line with a concrete failure scenario. No style nits.`,
          { label: `find:${l.key}:r${round}`, phase: 'Find', schema: BUGS },
        ),
      ),
    )
  )
    .filter(Boolean)
    .flatMap((r) => r.bugs)
  const fresh = found.filter((b) => !seen.has(key(b)))
  if (fresh.length === 0) { dry++; log(`round ${round}: dry (${dry}/2)`); continue }
  dry = 0
  fresh.forEach((b) => seen.add(key(b)))
  const judged = await parallel(
    fresh.map((b) => () =>
      parallel(
        ['re-derive the failure from the code', 'hunt edge cases that break the claim', 'adversarially refute — assume the finder is wrong'].map((lens) => () =>
          agent(`Judge this MyJKKN bug claim via: ${lens}. Claim: ${b.file}:${b.line} — ${b.desc}. Read the real code first. real=false if you cannot reproduce the reasoning.`, { phase: 'Verify', schema: VERDICT }),
        ),
      ).then((vs) => ({ b, real: vs.filter(Boolean).filter((v) => v.real).length >= 2 })),
    ),
  )
  confirmed.push(...judged.filter((j) => j.real).map((j) => j.b))
  log(`round ${round}: ${fresh.length} fresh → ${judged.filter((j) => j.real).length} confirmed (total ${confirmed.length})`)
}
if (round >= maxRounds && dry < 2) log(`stopped at maxRounds=${maxRounds} — NOT dry; coverage is bounded, say so in the report`)
return { confirmed, rounds: round, dry: dry >= 2 }
