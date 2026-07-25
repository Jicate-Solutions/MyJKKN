-- Quiet-period MORNING CHECK — run each session via Mgmt API curl (read-only).
-- Extended 2026-07-19 with SENSOR-PIPE checks (loops→graphs upgrade #2, Director-approved).
-- Verdict bar: due·ran match per cadence (Sun=curriculum, Mon=playbook+escalation),
--   stuck=0, errors=0 (bug.triage excepted until its lane fixes routing), spend=₹0.00, paid_calls=0.
-- Pipe bar: bridge_match ≥ 95% and not falling, judge parse_fails=0, judge label-rate noted (0 = paused by writer-fix ruling).
-- COE key check (manual, not SQL): direct-DB read via COE_SUPABASE_* creds still returns rows.

-- 1. Jobs last 24h by type/status (ai_jobs has NO created_at — use requested_at)
select job_type, status, count(*) from ai_jobs
 where requested_at > now() - interval '24 hours' group by 1,2 order by 1,2;

-- 2. Spend + paid-provider calls last 24h
select coalesce(sum(cost_inr),0) as spend,
       count(*) filter (where provider not in ('claude_code','groq')) as paid_calls
  from ai_model_usage where invoked_at > now() - interval '24 hours';

-- 3. Stuck jobs
select count(*) as stuck from ai_jobs
 where status not in ('done','error','canceled','cancelled','failed','delivered')
   and requested_at < now() - interval '30 minutes';

-- 4. Twins: the 6 loop twins stay enabled=false (chat-drain/poller/admission/ai-pulse/overnight/work-pulse stay true)
select routine_id, enabled from ai_routine_schedules where routine_id like 'maxlane:%' order by 1;

-- 5. Lane policies: all 6 = "jobs"
select policy_key, value from platform_policies
 where policy_key like 'loops.%.generation_lane' and scope_type='global';

-- 6. PIPE: M12 email bridge (distinct emails, cheap form — the 80k-row EXISTS scan times out)
--    2026-07-19 baseline: 187 distinct / 180 matched (96.3%; 7 people invisible to appraisal)
with fe as (select distinct lower(faculty_email) as e from session_feedback
             where created_at > now() - interval '30 days' and faculty_email is not null)
select count(*) as distinct_bridge_emails_30d,
       count(*) filter (where exists (select 1 from profiles p where lower(p.email)=fe.e)) as matched_to_profiles
  from fe;

-- 7. PIPE: note-safety judge health (parse failures must be 0; human_labels 0 = paused by design until writer fixed)
select count(*) as judged_7d,
       count(*) filter (where human_action is not null) as human_labels,
       count(*) filter (where verdict is null) as parse_fails
  from scf_note_judgements where created_at > now() - interval '7 days';

-- 8. GOVERNANCE: unpaired loops (counter_metric null) + open conflicts — watch the numbers move
select (select count(*) from loop_registry where counter_metric is null) as unpaired_loops,
       (select count(*) from loop_conflicts where status='open') as open_conflicts;
