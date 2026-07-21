# CONTINUATION BRIEF — MyJKKN SCF Note-Safety Judge: FINISH ENFORCING → SPOT-CHECK UI → METRIC 6
*Generated 2026-07-20 for the next session (post-/clear). Self-contained. Read top-to-bottom, then run the VERIFY block before touching anything.*

## TASK (P0 — user said "all the above 3 fully"; "Nothing — carry it all")
Pursue **all 3, in order, fully. Task 1 first.** Do not drop any. Context probe this session was healthy — carry the whole plan forward.

1. **[P0] FINISH THE ENFORCING JUDGE (PR-4 #2201).** It is MERGED + migration `20260720100000` applied to prod (RPCs + kill-switch policy seeded OFF), BUT **deploy is UNCONFIRMED** (a Vercel build showed *Canceled*) and the policy `scf.note_judge.enforce` is still **OFF (shadow)**.
   - (a) **VERIFY #2201 IS DEPLOYED BY CONTENT — do NOT trust build "Ready" status.** Hit the judge cron and confirm the response JSON now carries an `enforce{}` field and a `mode` field (old code lacked both): `curl -s "https://www.jkkn.ai/api/cron/scf-note-judge?secret=$CRON_SECRET" | head -c 300`. If those fields are absent → the enforce code is NOT live → fire the deploy hook first (`/deploy-myjkkn`), then re-verify by content.
   - (b) Once content-verified, **show the SQL first**, then flip the policy ON: `UPDATE platform_policies SET value='"on"'::jsonb WHERE policy_key='scf.note_judge.enforce';`
   - (c) Trigger the cron a few times; confirm the `enforce{}` tally shows published/held/pulled counts and that DB status transitions are correct: `auto_safe` drafts → `approved`; flagged (`needs_human`/`likely_unsafe`/crisis) `approved` notes → `draft` (pulled to human queue). NEVER auto-reject/delete.
   - (d) **ONE-TIME RECONCILIATION:** re-run the flagged-pullback — revert to `draft` any `status='approved'` note whose *current* verdict is `needs_human`/`likely_unsafe` or carries a crisis flag. This catches notes judged AFTER the earlier 58-note manual pull.
   - (e) **Confirm NO flagged note remains approved.** Kill-switch = flip policy back to `"off"` → returns to shadow.
   - Applied ONCE per note at verdict time (awaiting-RPC excludes judged rows → no pull/approve fight loop). A held note WAITS for a human — it is never discarded. Crisis → always human.

2. **[P0] BUILD THE SPOT-CHECK UI.** Add a panel/section on `/admin/learner-notes` that calls `fn_scf_auto_published_spotcheck(p_limit)` (already exists, `is_super_admin`-gated) and renders a random sample of auto-published notes — the human safety net over the auto-publish decision. Ship via `/ship-myjkkn` (worktree off `jicate/main`, PR base `main`, no self-merge).

3. **[P1 — LARGE] METRIC 6 MENTORSHIP FEDERATION.** Recipe lives in `project_faculty_appraisal_work_signals.md`. Source = the **separate** mentor.jkkn.ai Supabase (ref `qcugpxmulslqrqrjycti`, "Mentor module-Roja") reachable via the **same** Mgmt token. Proven rolled-back only (balakumaran 43→A++, 178/178 matched), **NOTHING applied**. Pieces: `mentor_signal_snapshot` (+RLS) ← COE-pattern nightly sync storing read-creds → `calc_faculty_mentees_met` → register `faculty.mentees_met` in `okr_metric_registry`. **MET mentee** = distinct `counseling_sessions.student_id` per `mentor_id`; link `mentors.user_id → users.email → profiles.email`. **DISTINCT ON(email) dedupe REQUIRED** — 178 emails resolve to 179 rows (1 dup-email profile); prefer active faculty.

## PROJECT + DATABASE
- Repo `/Users/omm/PROJECTS/MyJKKN`. Prod Supabase ref `kvizhngldtiuufknvehv`. Mgmt token at `~/.supabase/access-token`.
- **runsql() one-liner** (paste at shell start):
  ```bash
  runsql(){ T=$(tr -d ' \r\n' < ~/.supabase/access-token); curl -sS --max-time 60 -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -H "User-Agent: myjkkn/1.0" -d "$(jq -Rs '{query:.}' <<<"$1")"; }
  ```
- **Local branch `feat/campus-living-fee-compute-engine` = docs only. NEVER ship code from it.** Code ships via `/ship-myjkkn` (worktree off `jicate/main`, PR base `main`). **NEVER self-merge** — Director/merge-queue merges only.
- **DB changes via Management API `runsql`, BEGIN…ROLLBACK-validate first, show SQL before applying.** New cron-only SECDEF RPCs → `GRANT service_role`, NOT `authenticated` (cross-tenant leak otherwise; service_role bypasses grants).
- **JKKN terminology CI gate** bans people-terms (student/teacher/faculty/facilitator/classes/staff) and **SKIPS on draft PRs** → self-gate the terminology check (`python3 scripts/ci/check-terminology-delta.py jicate/main HEAD`) + scoped tsc locally before marking ready.
- **CRON_SECRET** lives in `.env.local` / `.env.production.local` (strip any literal `\n` suffix): `CS=$(grep -h '^CRON_SECRET=' .env.local .env.production.local | head -1 | sed 's/^CRON_SECRET=//' | tr -d '"'"'"' \r\n')`. Judge cron = `GET https://www.jkkn.ai/api/cron/scf-note-judge?secret=<CRON_SECRET>`.

## CURRENT STATE (LIVE vs OPEN)
- **SCF note-safety judge — 3 PRs:**
  - **#2191 (grounding)** — MERGED + DEPLOYED + VERIFIED. Persists `scf_learner_notes.source_signal` and feeds the judge; 1185 backfilled. PROVEN: note `4e964bf0` flipped `likely_unsafe@0.82` → `auto_safe@0.95`, zero flags; `hallucinated_specifics` false-flag rate 97%→0% on grounded sample.
  - **#2193 (leniency)** — MERGED + DEPLOYED + VERIFIED. Backfilled/reconstructed signals judged leniently (backfill can't recover `unmet_items`).
  - **#2201 (enforcing, PR-4)** — MERGED + migration `20260720100000` applied to prod (enforce RPC + spot-check RPC + kill-switch policy OFF). **DEPLOY UNCONFIRMED (Canceled build).**
- **Notes status:** 1130 approved / 58 draft. **Enforce policy = OFF (shadow).** Full corpus (1185) re-judge draining slowly via `:15/:45` crons on the ₹0 Max lane.
- **Migrations applied to prod:** `20260720060000` (source_signal + backfill + widened `fn_scf_notes_awaiting_judgement`) and `20260720100000` (enforce RPC + spot-check RPC + kill-switch policy).
- **Metric 6:** proven rolled-back only, nothing applied.

## KEY DECISIONS (do not re-open)
- The judge's **"97% hallucination" was CONTEXT-STARVATION** (judge fed only note text + scalar `net_decline`), NOT the writer hallucinating — ground-truth verified against `session_feedback`. This **SUPERSEDED** last session's "fix the writer first" plan; the writer was never broken.
- **Approval is NOT a manual gate.** The self-improving loop IS the quality mechanism (Director, mirroring the AI-Pulse auto-publish decision). But raw "Approve all" is unsafe (it published a garbled meta-instruction-leak note + flagged ones live to struggling learners). Synthesis = **grounded judge auto-publishes safe notes, holds flagged ones; a human spot-checks a sample, never reviews all.**
- **Chosen posture: AUTO-PUBLISH + SPOT-CHECK safety net** (NOT fully hands-off — the judge's `auto_safe` PRECISION is unmeasured, 0 human labels, so `loop_registry` stays `intake`, gates OFF).
- Enforce judge **NEVER auto-rejects/deletes** — a held note waits for a human in draft, not discarded. Crisis → always human. Applied ONCE per note at verdict time.
- **Deploy lesson:** merge ≠ deploy; a "Ready" build can PREDATE your merge → verify code-live BY CONTENT (a response field / DB artifact only the new code produces), fire the hook after merge.

## VERIFY CURRENT STATE (run BEFORE any work; if reality differs, STOP + report)
```bash
runsql "SELECT value FROM platform_policies WHERE policy_key='scf.note_judge.enforce';"    # expect "off" until you flip it
runsql "SELECT status, count(*) FROM scf_learner_notes GROUP BY 1 ORDER BY 2 DESC;"          # was 1130 approved / 58 draft
curl -s "https://www.jkkn.ai/api/cron/scf-note-judge?secret=$CS" | head -c 300               # look for `enforce` and `mode` fields = enforce code IS deployed
runsql "SELECT has_function_privilege('authenticated','fn_scf_note_apply_verdict(uuid,text,boolean)','EXECUTE');"  # expect false (service_role-only)
gh pr view 2201 --repo Jicate-Solutions/MyJKKN --json state   # expect MERGED
```
**AND the MANDATORY production-code sweep before ANY new build plan (Task 3 especially):**
```bash
git ls-tree jicate/main -r --name-only | grep -iE "(mentor|mentee|counseling|okr_metric|faculty_apprais)"
gh pr list --repo Jicate-Solutions/MyJKKN --state all --limit 30 --search "mentor in:title"
git worktree list
```

## KEY FILES
- Judge cron: `app/api/cron/scf-note-judge/route.ts` (grounding + leniency + enforce call; `buildJudgePrompt`/`formatSignal`; collect loop calls `fn_scf_note_apply_verdict`).
- Generator: `app/api/cron/scf-learner-notes/route.ts` (writes `source_signal`).
- Migrations: `supabase/migrations/20260720060000_scf_note_source_signal.sql`, `supabase/migrations/20260720100000_scf_note_judge_enforce.sql`.
- RPCs: enforce `fn_scf_note_apply_verdict(p_note_id, p_verdict, p_has_crisis)`; spot-check `fn_scf_auto_published_spotcheck(p_limit)`; kill-switch policy `scf.note_judge.enforce`.
- Admin queue page (host the spot-check UI here): `app/(routes)/admin/learner-notes/` — `/admin/learner-notes`, SuperAdminOnly. Learner read: `fn_scf_my_struggling_note` (approved only). Human review: `fn_scf_learner_notes_review`.
- Metric 6 recipe + registry engine: memory `project_faculty_appraisal_work_signals.md`; `lib/services/okr/okr-metric-engine.ts`; live wrapper template `calc_staff_count_wrapper`.
- Spec: `specs/scf-note-safety-review-loop-2026-07-19.md`. Memory: `project_faculty_appraisal_work_signals.md`, `feedback_merge_does_not_deploy_verify_by_content.md`.

## DO NOT / VERIFY BY
- **DO NOT** trust a "Ready"/"Canceled" build status = deployed — verify by CONTENT (cron response `enforce{}` + `mode` fields). **DO NOT flip the enforce policy ON before confirming the enforce code is live.**
- **DO NOT** apply prod DB changes without BEGIN…ROLLBACK validation first (show SQL). **DO NOT self-merge.** New cron-only SECDEF RPCs → `service_role`, not `authenticated`.
- **DO NOT** let the judge auto-reject/delete a flagged note — hold in `draft` only. Crisis → human.
- **DO NOT** create a parallel `scf_note_safety_review` loop key — the `scf-note-safety` row already exists in `loop_registry` (class `intake`); it stays intake until a human walks the grounded queue (no measured agreement yet).
- **Ship code via `/ship-myjkkn` only** (worktree off `jicate/main`). Never `npm run dev` from the `omm-dev`/docs root for testing — use a `jicate/main` worktree.

probe_verdict: healthy
