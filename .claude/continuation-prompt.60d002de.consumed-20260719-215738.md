# CONTINUATION BRIEF — MyJKKN — Faculty Appraisal Loop + SCF Note-Safety Self-Improving Loop (next session)

## TASK (P0 — user said "1,2,3. all 3 of them"; "Nothing — carry it all"; "read all")

Pursue ALL THREE, in order. Start Task 1 immediately.

1. **[P0] Merge PR #2184, then build PR-3.** Confirm PR #2184 (sidebar re-land) is merged (or merge it via Director / merge-queue) and that its sidebar entry is on `jicate/main`. THEN build **PR-3 of the SCF note-safety loop**: measure judge-vs-human **agreement** (populate/read `scf_note_judgements.agreed` — judge `auto_safe` == human `approve`) and **register the loop in `loop_registry`** (`loop_key='scf_note_safety_review'`, `loop_class='self_improving'`, `domain='session_feedback'`, 4-gate `gates` jsonb: spec_built / built_live / live_walked / outcome_ledger). Spec §9 + §13 PR-3 is the blueprint. No auto-approve yet — that is PR-4.

2. **[P0] Chase the shadow judge's hallucination finding.** The FIRST shadow run flagged **all 19 verdicts = `needs_human`** citing `hallucinated_specifics` + `pii_leak` (reasons: "specific dates/ratings unverifiable", "names mentor"). Investigate whether the **note GENERATOR** (`app/api/cron/scf-learner-notes/route.ts`) actually invents dates/ratings and names mentors in the note text — OR whether the **judge is over-flagging** mentor-names as PII / being too strict. Read a sample of real draft note text from `scf_learner_notes` and read the generator's prompt. This is real upstream note-quality signal. (PR-3's human-agreement measurement is what ultimately resolves "real vs over-flag" — the two tasks reinforce each other.)

3. **[P1 — LARGE] Metric 6 mentorship federation build.** From the SEPARATE mentor.jkkn.ai Supabase (ref `qcugpxmulslqrqrjycti`, reachable via the SAME Management token). Canonical source: a "MET" mentee = distinct `counseling_sessions.student_id` per `mentor_id`; link `mentors.user_id → users.email → MyJKKN profiles.email`. Build: nightly COE-pattern sync storing mentor read-creds → `mentor_signal_snapshot` table (+ RLS + **`DISTINCT ON (email)`** dedupe — 178 emails yielded 179 rows, 1 dup-email profile) → wrapper fn `calc_faculty_mentees_met` → register `faculty.mentees_met` in `okr_metric_registry`. Proven rolled-back (balakumaran 43→A++, 178/178 matched); **NOTHING APPLIED yet**. READ-not-migrate (federate — reusable pattern for ~29 sibling apps). "MET-only" mentees; anyone-who-mentors gets a signal; grade everywhere.

---

## PROJECT + DATABASE

- **Repo:** `/Users/omm/PROJECTS/MyJKKN`. **Prod Supabase ref:** `kvizhngldtiuufknvehv`. Management API token: `~/.supabase/access-token`.
- **DB runner (paste verbatim):**
  ```bash
  runsql(){ T=$(tr -d ' \r\n' < ~/.supabase/access-token); curl -sS --max-time 60 -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -H "User-Agent: myjkkn/1.0" -d "$(jq -Rs '{query:.}' <<<"$1")"; }
  ```
- **Local branch is `feat/campus-living-fee-compute-engine`** = bookkeeping/docs only; NEVER ship from it.
- **DB changes** apply via Management API (`runsql` or `apply_migration`); ALWAYS validate in a `BEGIN … ROLLBACK` txn first and surface results via `RAISE`, then apply for real.
- **Code ships** via `/ship-myjkkn` (Translator Pattern — clean worktree off `jicate/main`, copy files, open PR, base `main`). NEVER push `omm-dev`; NEVER self-merge. **`lib/sidebarMenuLink.ts` is a merge hotspot** — a merged sidebar entry can be silently overwritten by a later PR branched off older main; ALWAYS re-verify the entry survived after any merge.
- New **cron-only SECDEF RPCs → `GRANT service_role`, NOT `authenticated`** (authenticated = cross-tenant PII leak; service_role bypasses grants so the cron still works). Verify `has_function_privilege('authenticated', oid, 'EXECUTE')`=false, `service_role`=true.
- JKKN **terminology CI gate** bans people-terms (student/teacher/faculty/facilitator→banned; facilitator→"Senior Learner"). In prompts/comments use **learner + mentor/support**. Gate SKIPS on DRAFT PRs — self-gate locally before marking ready.

## CURRENT STATE (LIVE vs OPEN)

- **M4 + M12 faculty-appraisal metrics: APPLIED + VERIFIED on prod.** `okr_metric_registry`, `module='faculty_appraisal'`, **6 rows total**. M4 (4 rows: `faculty.{initiatives_total,publications,patents,innovations}`, from `faculty_initiatives`, INVOKER+STABLE, innovations=complement so total conserved; migration `20260719022731`). M12 (2 rows: `calc_faculty_feedback_understood` + `calc_faculty_feedback_improvement`, from `session_feedback` via the **EMAIL bridge**, min-10 gate→NULL; migration `20260719033340`). Verified values recorded (meenapriya, boobalan, kowsalya_p, shaanthanu, sharmilab).
- **SCF note-safety loop — PR-2 shadow judge DEPLOYED + VERIFIED LIVE.** Cron `/api/cron/scf-note-judge` (runs at :15 and :45) enqueues job `scf.note_safety_judge` on the ₹0 Max lane → records verdicts to **`scf_note_judgements`**. Substrate migration `20260719054000`. Verified: **19 verdicts recorded, parseFailures 0, shadow-safe** — `scf_learner_notes` statuses UNCHANGED (1135 draft / 3 approved, 0 auto_approved). The 2 RPCs (`fn_scf_notes_awaiting_judgement`, `fn_scf_record_note_judgement`) are **service_role-ONLY** (REVOKE anon+authenticated+PUBLIC, GRANT service_role) — cross-tenant-leak fix already applied.
- **PR #2183** (shadow judge cron): **MERGED + deployed + verified.**
- **PR #2184** (sidebar re-land): **OPEN + mergeable.** Background: PR #2181's "Learner Notes" sidebar entry was silently overwritten by PR #2182 (sidebarMenuLink.ts hotspot); #2184 re-lands it. **FIRST ACTION next session:** confirm #2184 merged (or merge-ready) AND the entry is on `jicate/main`.
- **Shadow judge's FIRST finding = Task 2's starting evidence:** all 19 verdicts `needs_human` for `hallucinated_specifics` + `pii_leak` ("specific dates/ratings unverifiable", "names mentor"). Could be the generator inventing details OR the judge over-flagging mentor-names as PII.

## KEY DECISIONS (with rationale — do not re-open)

- **M12 uses the EMAIL bridge.** `session_feedback.faculty_id ≠ profiles.id` (0/80269 match) — using `faculty_id` would zero the metric. Map `profile_id → profiles.email → session_feedback.faculty_email` (0 dup emails).
- **M4 `innovations` = COMPLEMENT** (not publication, not IP-bearing) so the four sub-metrics sum to the total (conserved).
- **The SCF notes are STUDENT-facing** AI support messages ("here's where to get help"), super-admin safety-gated — NOT teacher-facing. The loop KEEPS human review but AUTOMATES it: shadow → measure → per-class graduated auto-approve. **Auto-APPROVE only, NEVER auto-reject** (suppressing a note denies a struggling learner help); crisis flag → hard human counselor escalation, never auto. Judge is **recommendation-only** — it never mutates `scf_learner_notes.status` in shadow.
- **Honest limitation:** the loop's outcome signal is *human agreement*, not verified real-world outcome — report it as self-reinforcing/labour-saving, graduating toward verified only as real signals (learner response, safeguarding flags) are added later.
- The **"no-ranking self-view" doctrine was DROPPED institution-wide** (grades+ranks may show on every surface).
- **Cron-only SECDEF RPCs → service_role, not authenticated** (see DB section).

## VERIFY CURRENT STATE (run BEFORE any work — if reality differs, STOP + report, do NOT execute a stale plan)

```bash
# 1) Appraisal metrics — expect 6 rows
runsql "SELECT metric_key FROM okr_metric_registry WHERE module='faculty_appraisal' ORDER BY 1;"
# 2) Judge verdicts accumulating (was 19, all needs_human)
runsql "SELECT verdict, count(*) FROM scf_note_judgements GROUP BY 1 ORDER BY 1;"
# 3) SHADOW SAFETY — statuses MUST stay 1135 draft / 3 approved (0 auto_approved)
runsql "SELECT status, count(*) FROM scf_learner_notes GROUP BY 1 ORDER BY 1;"
# 4) Sidebar re-land landed?
gh pr view 2184 --repo Jicate-Solutions/MyJKKN --json state,mergeable
git -C /Users/omm/PROJECTS/MyJKKN fetch jicate main && git -C /Users/omm/PROJECTS/MyJKKN show jicate/main:lib/sidebarMenuLink.ts | grep -c "label: 'Learner Notes'"
# Prod up
curl -s -o /dev/null -w "%{http_code}\n" https://www.jkkn.ai/
```
Also run the **mandatory production sweep** before ANY new build plan (PR-3 / Metric 6): `git ls-tree jicate/main -r --name-only | grep -iE "scf|note|judge|mentor|okr_metric"` + `gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "<keywords> in:title"`. Plan without sweep = invalid.

## KEY FILES / MEMORY (read first — user said "read all")

- **Spec:** `/Users/omm/PROJECTS/MyJKKN/specs/scf-note-safety-review-loop-2026-07-19.md` (4-PR graduated plan; PR-3 = measure agreement + register loop_registry; PR-4 = per-class graduated auto-approve above precision floor; §12 open params are owner-set).
- **Appraisal memory:** `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_faculty_appraisal_work_signals.md` (M4/M12 detail, the notes loop, Metric 6 recipe + gotchas).
- **Security memory:** `/Users/omm/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_cron_only_secdef_rpcs_service_role_not_authenticated.md`.
- **AI-jobs lane pattern:** `lib/services/platform/ai-jobs-lane.ts` (`enqueueJobsLane` / `collectJobsLane`; `fn_ai_enqueue_system`; `prompt_template='{{prompt}}'` — cron assembles the full prompt; `createServiceRoleClient` is UNTYPED so custom `rpc()` needs no `types/supabase.ts` entry).
- **The shadow cron:** `app/api/cron/scf-note-judge/route.ts` (enqueue → collect → record; SHADOW never writes `scf_learner_notes.status`; unparseable verdict → needs_human; crisis flag → never auto_safe).
- **The note GENERATOR (Task 2 investigates this):** `app/api/cron/scf-learner-notes/route.ts` (drafts on the Max lane, job type `scf.learner_notes`) — read its prompt to see if it invents dates/ratings / names mentors.
- **SCF label source RPC:** `fn_scf_learner_notes_review(p_ids uuid[], p_action text)` (`approve`/`reject`, `is_super_admin()`-gated today, 3 approves / 0 rejects) — the human verdicts PR-3 measures agreement against. Queue read: `fn_scf_learner_notes_pending()`. Learner read: `fn_scf_my_struggling_note()`.
- **Metric 6 source:** mentor Supabase `qcugpxmulslqrqrjycti`; canonical `calc_faculty_mentees_met` reads distinct `counseling_sessions.student_id` per `mentor_id`; link `mentors.user_id → users.email → profiles.email`. Live template for the wrapper+registry recipe: `calc_staff_count_wrapper` / `competency_okr_metrics.sql`. COE-pattern nightly sync stores read-creds.

## DO NOT / VERIFY BY

- **DO NOT** apply prod DB changes without a `BEGIN … ROLLBACK` validation first (show SQL before applying).
- **DO NOT** trust an agent's claimed prod success — re-query the DB yourself.
- **DO NOT** let the shadow judge write `scf_learner_notes.status` — shadow = record-only. Auto-approve is PR-4, per-class, above precision floor, with spot-check + kill-switch; NEVER auto-reject.
- **DO NOT** self-merge; Director/merge-queue merges. Grant new cron-only SECDEF RPCs to **service_role, NOT authenticated**.
- **VERIFY BY:** re-query `okr_metric_registry` rows (=6) + `scf_note_judgements` verdict counts (growing) + `scf_learner_notes` statuses (unchanged 1135/3); confirm #2184 entry on `jicate/main`; paste the applied SQL for any DB change.

probe_verdict: healthy
