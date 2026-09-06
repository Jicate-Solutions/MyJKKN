-- =============================================================================
-- 20260714040713_loop_registry_capability_gap.sql
-- 2026-07-14: register the capability-gap loop (Phase 1+2 live, moat proven)
--
-- The AI-assistant Capability-Gap Loop is LIVE + PROVEN on prod (Phase 1
-- detect/cluster/surface + Phase 2 triage/measure) but is UNGOVERNED — it is
-- absent from the loop control tower (/admin/loops reads public.loop_registry,
-- seeded by 20260710233000_loop_registry_edges_audits.sql). This adds the one
-- missing loop_registry row so the tower's chips + wiring view can anchor to
-- it 1:1, exactly like the other ~17 loops.
--
-- It is a self_improving loop (loop_class): it mines ai_jobs (job_type=
-- 'ai_query.chat') for model-flagged refusals -> clusters -> triages a
-- gap-class -> human-gated cheapest-correct fix -> MEASURES the refusal-
-- frequency drop the next cycle via fn_capgap_measure (verified moat: the
-- billing.fee_defaulters cluster went refusal-freq 1.0 -> 0.0 after its
-- class-1b tool exposure, and fn_capgap_measure auto-resolved it).
--
-- Gate state {"a":"on","f":"off","g":"on","m":"on"}:
--   g=on  — super-admin-governed Capability Gaps tab (/ai-query/admin).
--   a=on  — actionable clusters surface (G12: recur before they act).
--   m=on  — measurement is BUILT + PROVEN via fn_capgap_measure (Phase 2).
--   f=off — no feed-forward / auto-retest re-enqueue yet (that is Phase 3).
--
-- stack_tier=4: a meta/platform loop — it improves the ASSISTANT itself, one
-- band above the domain loops (tier 3), alongside metaloop (tier 4).
--
-- Pure seed: identity-keyed ON CONFLICT (loop_key) DO NOTHING — immune to the
-- mutable-column seed-resurrection class. No new RPC, no schema change.
-- =============================================================================

INSERT INTO public.loop_registry
  (loop_key, name, stack_tier, loop_class, domain, description, gates, routine_id, is_active) VALUES
  ('capability-gap', 'AI Assistant Capability-Gap Loop', 4, 'self_improving', 'platform',
   'Mines the AI assistant chat log for model-flagged refusals -> clusters -> triages a gap-class -> human-gated cheapest-correct fix -> measures the refusal-frequency drop next cycle (verified moat: billing 1.0->0.0).',
   '{"a":"on","f":"off","g":"on","m":"on"}'::jsonb, 'capgap-scan', true)
ON CONFLICT (loop_key) DO NOTHING;
