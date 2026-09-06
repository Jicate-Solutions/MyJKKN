-- 2026-07-13 Gate ① for the self-improving audit: seed the first live discovery query.
-- Redirect (Director "who is auditing whom / keep both"): the target is a self-improving
-- AUDIT. Sizing scan found the audit DARK at gate ① (3 cycles, 0 attestations, 0/61
-- discovery queries). This lights gate ① with the loop_audits CITATION — the audit cites
-- the loop verdicts the /loops harness already records (#1966), which also fires the
-- audit's generate-gate for the first time. Runs on the hardened discovery path
-- (#1926 byte-match + #1927 read-only). Verified live via the RPC (super-admin): returned
-- feeder(sim), scf(sim), scf(walk) verdicts. Idempotent.
INSERT INTO public.audit_parameter_catalog
  (code, name, parameter_group, description, framework_mapping, discovery_query_sql,
   default_owner_role, p1_sla_days, p2_sla_days, evidence_required, institution_id, is_system, is_active)
VALUES (
  'LOOP_HEALTH',
  'Self-improving loops — verdict on record',
  3,
  'Cites loop_audits: each institutional improvement loop should carry a fresh verdict this cycle. A loop with no verdict in the cycle window is a continuous-improvement gap (NAAC 7.3 / IQAC).',
  '{"NAAC":"7.3","IQAC":"continuous_improvement"}'::jsonb,
  $q$SELECT loop_key, layer,
       (array_agg(verdict ORDER BY audited_at DESC))[1] AS latest_verdict,
       max(audited_at)::date AS last_audited,
       count(*) AS audit_runs
FROM loop_audits
WHERE audited_at::date BETWEEN $2 AND $3
GROUP BY loop_key, layer
ORDER BY loop_key, layer$q$,
  'lead_auditor', 14, 30, '[]'::jsonb, NULL, true, true
)
ON CONFLICT (code, institution_id) DO UPDATE
  SET discovery_query_sql = EXCLUDED.discovery_query_sql,
      description         = EXCLUDED.description,
      framework_mapping   = EXCLUDED.framework_mapping,
      is_active           = true,
      updated_at          = now();
