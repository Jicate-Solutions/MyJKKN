-- ============================================================================
-- CAC pre-meeting AI brief — C3 of the Cluster Academic Council engine.
-- Created: 2026-07-26.
--
-- ONE declarative ai_job_types row, no runner script: the registry is a
-- declarative plugin system (a new prompt-only AI job = one DB row), so this
-- migration is the entire build. Mirrors the proven ops.brief row shape
-- (₹0 Max lane, provider='anthropic', model_id='sonnet' family alias — never a
-- dated id — tool_set='none', output_target='job.result', mustache {{var}}
-- placeholders + input_schema field descriptors).
--
-- What it does: the evening before a Cluster Academic Council sitting, this job
-- drafts the pre-meeting brief (loop deltas vs the cluster's OWN baseline,
-- below-target items, carried resolutions with strike counts, evidence landed,
-- cross-college escalations from the college IQAC spines) plus a proposed
-- agenda and an ATR-format minute skeleton. The convener okays it; the AI never
-- decides. Enforces the Director's forbidden-agenda rule: platform-readable
-- numbers live in the brief, NEVER on the agenda — the agenda carries only
-- blockers, decisions, and carried items.
--
-- interactive=false is CRITICAL: interactive=true types are only served by the
-- chat drain and would never run scheduled.
--
-- Ships DARK: enabled=false. Because fn_ai_enqueue_system gates on
-- enabled=true, zero jobs can be queued until the Director flips it at go-live
-- AFTER the CAC is constituted (no deploy needed to go live).
--
-- House rule: INSERT ... SELECT ... WHERE NOT EXISTS (never ON CONFLICT —
-- re-running must never touch a row the Director may have flipped live).
-- Apply is Director-gated; validated on prod in a BEGIN..ROLLBACK txn only.
-- ============================================================================

INSERT INTO public.ai_job_types
  (job_type, title, description, prompt_template, tool_set, output_target,
   interactive, lane, allow_rule, max_inflight, schedulable, enabled,
   input_schema, expected_seconds, provider, model_id, external_allowed, loop_key)
SELECT
  'accreditation.cac_brief',
  'CAC · Pre-meeting brief',
  'Pre-meeting brief for a Cluster Academic Council sitting — drafts itself the evening before; the convener okays it. Covers loop deltas vs the cluster''s own baseline, below-target items, carried resolutions with strike counts (2+ strikes flagged for Director escalation), evidence landed, and cross-college exceptions escalated up from the college IQAC spines. Enforces the forbidden-agenda rule: platform-readable numbers stay in the brief, never on the agenda. DARK: enabled=false until the Director flips it after the CAC is constituted.',
  $prompt$You are the secretary-analyst for a JKKN Cluster Academic Council (CAC), drafting the pre-meeting brief on the evening before a sitting. The convener reviews and okays this draft; you prepare, you never decide.

Cluster: {{cluster}}
Sitting date: {{sitting_date}}
Last sitting: {{last_sitting}}

Loop movement since the last sitting (item · cluster's own baseline · previous · current):
{{loop_deltas}}

Items below target:
{{below_target}}

Carried resolutions (resolution · owner seat · carried_count · strikes):
{{carried_resolutions}}

Evidence landed since the last sitting:
{{evidence_landed}}

Exceptions escalated up from the college IQAC spines (cross-college cause only):
{{escalations}}

Write EXACTLY these three parts, nothing else:

"Brief:" five short sections in this order, each grounded in the data above. If a section's data block is empty, write exactly: "Nothing to report."
1. Moved since last sitting: what improved or slipped against the cluster's OWN baseline. Compare this cluster only to itself, never to another cluster.
2. Below target: each item still under its target, worst gap first, with the number and the target.
3. Carried resolutions: each carried resolution with its carried_count and strike count. Any resolution at 2 or more strikes gets its own line starting exactly "ESCALATE TO DIRECTOR:" with the resolution and its strike count.
4. Evidence landed: what evidence arrived since the last sitting and which item it supports.
5. Escalated from college IQACs: only exceptions whose cause crosses colleges — name the colleges and the shared cause. A single-college exception stays with that college's IQAC; do not list it.

"Proposed agenda:" a numbered list carrying ONLY blockers needing the council, decisions needing a resolution, and carried items. The forbidden-agenda rule is absolute: any number readable from the platform belongs in the brief above, NEVER on the agenda. No metric reviews, no status readouts, no presentation of figures — if an item is just numbers, it is already in the brief; drop it.

"Minute skeleton (ATR):" one line per agenda item in the form: item | resolution taken: ____ | responsibility (seat): ____ | target date: ____ | status: ____ . Leave the blanks for the sitting to fill.

Terminology: write "learner", never "student"; write "Senior Learner" where faculty is meant. Cite the actual numbers. No preamble, no sign-off.$prompt$,
  'none', 'job.result',
  false,          -- interactive: scheduled jobs must be false (chat drain would starve it)
  'max', 'seat_owner', 1, true,
  false,          -- enabled: ships DARK; Director flips at go-live post-CAC-constitution
  '[{"key":"cluster","type":"textarea","label":"cluster","required":true},
    {"key":"sitting_date","type":"textarea","label":"sitting_date","required":true},
    {"key":"last_sitting","type":"textarea","label":"last_sitting","required":false},
    {"key":"loop_deltas","type":"textarea","label":"loop_deltas","required":false},
    {"key":"below_target","type":"textarea","label":"below_target","required":false},
    {"key":"carried_resolutions","type":"textarea","label":"carried_resolutions","required":false},
    {"key":"evidence_landed","type":"textarea","label":"evidence_landed","required":false},
    {"key":"escalations","type":"textarea","label":"escalations","required":false}]'::jsonb,
  60, 'anthropic', 'sonnet',
  false,          -- external_allowed: internal governance brief, never B2A-reachable
  NULL            -- loop_key: welded later if the CAC loop is spine-registered
WHERE NOT EXISTS (
  SELECT 1 FROM public.ai_job_types WHERE job_type = 'accreditation.cac_brief'
);
-- fallback_provider / fallback_model_id deliberately omitted (NULL) — mirrors
-- ops.brief, which carries no fallback.
