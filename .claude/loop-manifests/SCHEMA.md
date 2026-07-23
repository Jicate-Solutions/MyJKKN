# Loop manifest schema

One YAML per loop, named `<loop_key>.yaml` where `loop_key` matches
`loop_registry.loop_key` (= the /admin/loops card id). A manifest records the
Step-0 facts the moat-loop sim recipe needs, so audits are mechanical.

```yaml
loop_key: scf                  # loop_registry key, REQUIRED
name: Session-Feedback Teaching Loop
prod_ref: kvizhngldtiuufknvehv # Supabase project

tables:
  input: session_feedback      # where the signal enters
  action: scf_ai_suggestions   # where actions + outcomes live

sim:                           # the rolled-back known-delta sim (regress layer)
  sentinel: ZZAUDIT            # prefix for every seeded identifier
  seed_input: |                # SQL template: seed >=k input rows for 2 sessions
    ...                        #  (baseline session + next session), FK-safe
  seed_action: |               # SQL template: seed the backdated action row
  verifier: fn_x(0)            # the measure function + args
  asserts:                     # the invariants — NEVER carry numbers between loops
    no_change: "0.00"          # same value both sessions => lift MUST be this
    known_delta: { seed: "+2", expect: "2.00" }
  reset_between_deltas: |      # SQL to null the outcome fields for the 2nd assert
  notes: []                    # traps specific to this loop

confound:                      # causal-validity reads (all read-only)
  verdict_column: human_verdict
  query: |                     # the not_tried-vs-tried falsification
  min_rows: 10                 # below this, report "insufficient fuel", don't conclude

feed_forward:                  # Tier B (gated) — prove N+1 conditions on N's outcome
  reader: fn_scf_prior_suggestion
  trigger: { kind: api_post, path: /api/..., persona: superadmin, body: {...} }
  pass_criteria: [cites_prior, cites_measured_outcome, changes_approach]

walk:                          # persona circuit (walk layer) — ordered human hops
  personas: { student: test.student@jkkn.ac.in, faculty: test.faculty@jkkn.ac.in, ... }
  hops:
    - { as: student,  do: form_submit, page: /..., assert_db: "..." }
    - { as: superadmin, do: api_post, path: /api/..., assert: http_200 }
    - { as: faculty,  do: click, page: /..., target: "button text", assert_db: "..." }
    - { as: principal, do: open_assert, page: /..., expect_text: "..." }
  forbidden: [nudges, digests]  # side-effects a walk must never trigger
  cleanup: |                    # SQL deletes + count-restore asserts

registry_gates_hint: '{"g":"on","a":"on","m":"on","f":"on"}'  # expected registry state
```

Rules:
- `asserts` values derive from THIS loop's SQL types (moat-loop troubleshooting:
  never anchor on another loop's magic number).
- Any block may be `derive_at_run: true` with pointers (file:fn) when the
  recipe is best re-derived from current code — prefer that over letting a
  manifest go stale silently.
- Manifests are living docs: after every audit that discovers a trap, append
  it to `sim.notes`.
