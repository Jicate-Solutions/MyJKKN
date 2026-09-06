-- ============================================================================
-- 20260825030200_loops_charter_draft_jobtype.sql
-- ----------------------------------------------------------------------------
-- MetaLoop charter-drafting — the ₹0 Max-lane JOB TYPE ('loops.charter_draft')
-- + its version-1 champion row in ai_prompt_versions.
--
-- Declarative registry: a new prompt-only AI job is a DB row, not a runner
-- script (mirrors prompt_compare.judge, 20260803030000). fn_ai_enqueue_system
-- refuses any job_type without an enabled row here, so this row IS the switch.
--
-- ENABLED=TRUE ON PURPOSE — a deliberate departure from the ships-dark
-- convention, stated so the Director can flip it at apply time if preferred:
-- most dark-shipped types face students or drive notifications; this one's
-- entire output is a *_proposals row that only super admins can even read, and
-- the migration itself is Director-gated at apply — the apply IS the go. While
-- un-applied, nothing anywhere changes.
--
-- Prompt contract (house maxlane-cron pattern, lib/services/platform/
-- ai-jobs-lane.ts): the template below ends with the {{prompt}} slot; the
-- metaloop-charter-drafts cron passes the assembled evidence bundle as
-- payload.prompt and the drain substitutes it. (The model_compare judge once
-- shipped WITHOUT its slot — codified lesson, never omit it.)
--
-- ai_prompt_versions seed: version 1 'champion' mirroring the live template
-- (same backfill shape as 20260804060000 §1 — WHERE NOT EXISTS, never
-- ON CONFLICT). Future edits via the admin prompt UI mint challengers.
--
-- ⛔ NOT APPLIED by merging — prod apply is a separate, Director-gated step.
--    No BEGIN;/COMMIT; in this file (rollback-rehearsal safe).
-- ============================================================================

-- ── 1. Job type row (guarded on identity — a Director edit must never be
--      clobbered by a seed re-run) ────────────────────────────────────────────
INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id, external_allowed, loop_key)
SELECT
  'loops.charter_draft',
  'MetaLoop · Loop Charter Drafter',
  'Drafts a loop charter (the 5 legs + kill rule + suggested verdict owner) for an uncharted loop_registry row, from an evidence bundle of live data (registry row + recent loop_audits + routine run history) assembled by the metaloop-charter-drafts cron. Output lands ONLY in ai_jobs.result; the cron''s collect pass files it as a loop_charter_proposals row that a super admin approves (fn_loop_apply_charter_proposal) or rejects on /admin/loops/charters. MACHINE DRAFTS, HUMANS SIGN — nothing here writes a charter onto the registry.',
  $charter$You draft a LOOP CHARTER for the MyJKKN platform (JKKN educational institutions). A "loop" is a cycle the platform runs: Generate an intervention → Act on the world → Measure the outcome against the loop's OWN baseline → Feed the measurement forward. A CHARTER is the loop's constitution: the five legs that make its claim of self-improvement falsifiable, plus a kill rule.

You will be given an EVIDENCE BUNDLE (JSON): the loop_registry row (name, class, domain, description, gates, any legs already written), its recent loop_audits rows (layer/verdict/evidence), and recent routine run history where the loop has a scheduled routine.

Draft the charter from the EVIDENCE ONLY:
- outcome_metric: the number that defines "better" for this loop. It must name data that demonstrably exists in the evidence (a table, an audit's evidence keys, a routine's recorded output) — never a metric the platform does not yet record.
- counter_metric: the independent number that catches this loop's cheap win (the Goodhart pair). It MUST measure a DIFFERENT quantity than the outcome — a guard sharing its predicate is vacuous. If the evidence offers no honest counter, say so in the rationale and propose the nearest real one.
- intervention: the concrete action the loop takes on the world, as the evidence shows it happening.
- baseline_window: the loop's OWN pre-intervention window (never a cross-population comparison). It must reference data that exists in the evidence.
- remeasure_window: when the outcome is re-measured after the intervention.
- kill_rule: the pre-committed condition under which this loop should be switched off (e.g. "N cycles with no measurable lift", "counter metric degrades for M consecutive windows"). Mandatory — every charter carries one.
- suggested_verdict_owner: an email visible in the evidence (registry owner_email or similar) — the human who should own the better/worse verdict. Never invent an address.
- rationale: 2-4 plain sentences citing the specific evidence each leg stands on.

BE CONSERVATIVE — the costly error is a confident charter over thin evidence. A wrong charter turns the Tower's honesty instrument into a liar. If the evidence is too thin to charter honestly (no measured output, empty audits, a routine that never fired), return exactly {"insufficient": true, "reason": "<what is missing>"} instead of a charter.

OUTPUT — strict JSON only, no prose, no code fences. Either:
{"outcome_metric": "...", "counter_metric": "...", "intervention": "...", "baseline_window": "...", "remeasure_window": "...", "kill_rule": "...", "suggested_verdict_owner": "...", "rationale": "..."}
or:
{"insufficient": true, "reason": "..."}

{{prompt}}$charter$,
  'none', 'job.result',
  false,          -- interactive: enqueued by the weekly cron, never the chat drain
  'max', 'seat_owner', 3,
  false,          -- schedulable: the metaloop-charter-drafts routine is the clock, not this row
  true,           -- enabled: deliberate (see header) — apply of this migration is the Director's go
  '[{"key":"prompt","type":"textarea","label":"Assembled evidence bundle (registry row + loop_audits + routine run history)","required":true}]'::jsonb,
  60, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal governance loop, never B2A-reachable
  NULL            -- loop_key: welded later if the MetaLoop is spine-registered
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_job_types WHERE job_type = 'loops.charter_draft'
);
-- fallback_provider / fallback_model_id deliberately omitted (NULL) — mirrors
-- prompt_compare.judge / accreditation.cac_brief, which carry no fallback.

-- ── 2. Version-1 champion in ai_prompt_versions (same shape as the
--      20260804060000 backfill: WHERE NOT EXISTS, never ON CONFLICT) ─────────
INSERT INTO public.ai_prompt_versions (job_type, version, prompt, status, notes, created_by)
SELECT t.job_type,
       1,
       t.prompt_template,
       'champion',
       'seed: initial charter-drafting prompt (MetaLoop Wave 0, PR feat/metaloop-charter-drafting)',
       'migration:20260825030200'
  FROM public.ai_job_types t
 WHERE t.job_type = 'loops.charter_draft'
   AND t.prompt_template IS NOT NULL
   AND btrim(t.prompt_template) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.ai_prompt_versions v WHERE v.job_type = t.job_type
   );

NOTIFY pgrst, 'reload schema';
