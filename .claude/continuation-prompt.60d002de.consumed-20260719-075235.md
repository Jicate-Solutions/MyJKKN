TASK (P0, USER-STATED VERBATIM 2026-07-19): "Assign an async agent to update the green items already live in database to work signals like innovations patent publications" — then "We will do this async agent work after cnext is executed." So: spawn an async (background) Agent to wire the GREEN / already-live-in-the-MyJKKN-database appraisal metrics as canonical work-signals, STARTING with Metric 4 (innovations / patents / publications, sourced from `public.faculty_initiatives`). Extend the EXISTING canonical metric mechanism — do NOT invent a new engine or per-surface raw queries. Apply to prod, each change validated in a rolled-back txn FIRST, then verified. A fully-formed agent prompt was drafted last session (re-create it from the recipe below).

PROJECT: /Users/omm/PROJECTS/MyJKKN. This is the local diverged `feat/campus-living-fee-compute-engine` branch (bookkeeping only). DB changes apply directly via the Supabase Management API (below); no PR needed for DB-only metric wiring, though you MAY also drop a migration file under `supabase/migrations/` + update `supabase/SQL_FILE_INDEX.md` for the record.

DATABASE: MyJKKN prod Supabase ref `kvizhngldtiuufknvehv`. Management token at `~/.supabase/access-token`. Runner:
  runsql(){ T=$(tr -d ' \r\n' < ~/.supabase/access-token); curl -sS --max-time 60 -X POST "https://api.supabase.com/v1/projects/kvizhngldtiuufknvehv/database/query" -H "Authorization: Bearer $T" -H "Content-Type: application/json" -H "User-Agent: myjkkn/1.0" -d "$(jq -Rs '{query:.}' <<<"$1")"; }
A `BEGIN; …; <SELECT>; ROLLBACK;` script returns the mid-txn SELECT rows before rolling back (verified) — use it to validate before applying.

THE CANONICAL METRIC MECHANISM (extend THIS — proven last session):
- `okr_metric_registry` + `OKRMetricEngine` (lib/services/okr/okr-metric-engine.ts). A metric = (1) a wrapper fn `name(p_profile_id uuid, p_institution_id uuid, p_start_date date, p_end_date date) RETURNS numeric` reading the canonical source ONCE; (2) a registry row `source_type='db_function', source_config='{"function_name":"name"}'::jsonb` via `INSERT … ON CONFLICT (metric_key) DO UPDATE`.
- Live template: `calc_staff_count_wrapper` (INVOKER, STABLE, plain plpgsql). Multi-metric template: migration `competency_okr_metrics.sql`.
- PROVEN anchor fn (returns 6 for meenapriya@jkkn.ac.in): `calc_faculty_initiatives_count` — counts `faculty_initiatives` where `inventor_id=p_profile_id`, window on `COALESCE(submitted_at::date, last_status_change_at::date)`.
- Registry column TYPES (strict): applicable_roles text[] (`'{faculty,hod}'::text[]`); applicable_scopes metric_scope[] (`'{individual}'::metric_scope[]`; valid: individual/section/department/program/institution/organization); value_type metric_value_type (use `'count'`; valid: number/percentage/currency/count/ratio/duration/score); requires_context jsonb; source_config jsonb. Must-supply NOT-NULL: metric_key, display_name, module, category, source_type, source_config. No triggers on the table.

WHAT THE AGENT SHOULD DO (Metric 4):
1. `SELECT category, count(*) FROM faculty_initiatives GROUP BY 1;` to learn real categories (seen: clinical, publication, ip_bearing — VERIFY).
2. Create wrapper fns (module 'faculty_appraisal', INVOKER+STABLE like calc_staff_count_wrapper): `faculty.initiatives_total` (all), `faculty.publications` (category='publication'), `faculty.patents` (the IP category — confirm 'ip_bearing'), `faculty.innovations` (remaining, e.g. clinical — document mapping).
3. Register each in okr_metric_registry.
4. DISCIPLINE: validate each in BEGIN…ROLLBACK first (call fns for meenapriya AND boobalan.a); then apply; then VERIFY independently (meenapriya initiatives_total=6; boobalan.a publications=1). If any fn is SECDEF, add `REVOKE EXECUTE … FROM anon, PUBLIC;`.
5. CONSTRAINTS: NO UI/frontend, NO grading/salary/hr_performance_reviews, NO work_signal_types spine / fn_work_signals_for, NO cross-app/mentor metrics. faculty_initiatives-sourced only.
6. After the agent reports, VERIFY its work yourself (never trust agent-claimed prod success): re-query the registered metric_keys + sample computations.

CURRENT STATE (as of brief-write time):
- NOTHING applied to prod for the appraisal work — all proofs were rolled-back. Verified clean: `okr_metric_registry` has NO faculty_appraisal rows; NO `calc_faculty_*` fns exist.
- Shipped+LIVE earlier this session (DONE, don't redo): work-signals spine P1.1 deep-links + P2 marking reconciliation — PR #2159 merged (main 33f20c7d2), deployed, LIVE-verified as Dr. Venkateswaramurthy (Mark 0→91, 98th pct/top_quartile, deep-links render).

FOLLOW-ON TASKS (after P0):
- [P1] Metric 6 mentorship (LARGE): canonical source = SEPARATE mentor.jkkn.ai Supabase project `qcugpxmulslqrqrjycti` ("Mentor module-Roja"), reachable via the SAME Mgmt token. Proved rolled-back: `mentor_signal_snapshot(profile_id PK, mentees_met, last_synced_at)` + `calc_faculty_mentees_met` → balakumaran 43→A++; "met" mentee = distinct `counseling_sessions.student_id` per mentor; link mentors.user_id→users.email→profiles.email (178/178 matched). ⚠️ 1 duplicate-email profile → sync must `DISTINCT ON (email)` preferring active faculty. Apply foundation + COE-pattern nightly sync (store mentor read-creds) + UI/grade.
- [P2] Other green metrics (student feedback scf_*, AI-adoption/PDE) + the dormant grading container `hr_performance_reviews`/`_cycles` (0 rows; self→supervisor→sedc→final_score shape matches the SOP).

VERIFY CURRENT STATE (run BEFORE work — if reality differs, STOP, report):
- `bash -c 'runsql(){...}; runsql "SELECT count(*) FROM okr_metric_registry WHERE module=''faculty_appraisal'';"'` → expect 0 (nothing applied yet).
- `runsql "SELECT proname FROM pg_proc WHERE proname ~* ''^calc_faculty_'';"` → expect empty.
- Confirm `faculty_initiatives` still has rows: `runsql "SELECT category,count(*) FROM faculty_initiatives GROUP BY 1;"`.

KEY DECISIONS (with rationale):
- Read/federate, DON'T migrate the mentor app (or any of the ~30 sibling JKKN apps) — the Mgmt token reaches them all; migrating a live app only makes sense if it's dead/thin/redundant. MyJKKN becomes the canonical signal-spine that READS from the constellation.
- "Only MET mentees count" (≥1 counseling session), "anyone who mentors gets their own signal", and — IMPORTANT — the "self-view NEVER ranks / presence not scores" doctrine was DROPPED institution-wide (Omm, fully informed; grades may now show on every surface incl. the daily card). See memory `feedback_no_ranking_doctrine_dropped_institution_wide`.
- Use the CANONICAL okr_metric_registry engine, not the work_signal_types spine, as the metric home (the spine is the facilitator-facing presence layer; metrics feed it via the provider column later).
- probe_verdict: healthy (context intact this session; the spine work shipped+verified coherently, the appraisal work built on it consistently).

KEY FILES / MEMORY TO READ FIRST:
- `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_faculty_appraisal_work_signals.md` (PRIMARY — the full canonical pattern, mentor source, decisions, proof status)
- `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/feedback_no_ranking_doctrine_dropped_institution_wide.md`
- `git show jicate/main:lib/services/okr/okr-metric-engine.ts` + migration `competency_okr_metrics.sql` (the pattern)
- `~/.claude/projects/-Users-omm-PROJECTS-MyJKKN/memory/project_work_signals_spine.md`

DO NOT: apply anything to prod without a rolled-back validation first; trust an agent's claimed prod success without re-verifying yourself; touch UI/grading/the spine/cross-app in the P0 metric-wiring; migrate the mentor app.
VERIFY BY: registered metric_keys re-queried from okr_metric_registry; each wrapper fn computes the expected value for meenapriya (initiatives_total=6) + boobalan.a (publications=1); paste the applied SQL.
