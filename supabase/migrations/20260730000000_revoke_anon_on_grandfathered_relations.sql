-- 20260730000000_revoke_anon_on_grandfathered_relations.sql
-- ============================================================================
-- APPLY STATUS: ALREADY APPLIED to production (kvizhngldtiuufknvehv) on
-- 2026-07-29 ~23:5x IST via the Management API, on an explicit Director
-- decision to close the whole grandfathered set. This file is the record.
-- Every statement is idempotent.
--
-- WHAT THIS CLOSES
--   32 relations that the public `anon` key could read, plus ims_user_store_grants
--   (whose RLS was working, so it leaked nothing — closed as defence in depth).
--   Exposure surface went 36 -> 4. The four that remain are deliberate and are
--   recorded in scripts/ci/anon-exposure-allowlist.json.
--
-- GRANTS ONLY — NO RLS CHANGES, ON PURPOSE
--   All 32 already had RLS enabled; there was nothing to turn on. And enabling
--   RLS on a table that has it off is NOT a safe default here: RLS on with no
--   policy denies every role, so "hardening" a table that logged-in users read
--   would break working features to fix an anonymous-only problem. Revoking the
--   anon grant stops anonymous access completely and leaves authenticated
--   behaviour untouched — the narrowest change that fully solves it.
--
--   Safe because `authenticated` holds its own direct grants, verified before
--   applying: information_schema.role_table_grants showed 7 privileges for anon
--   and 7 for authenticated on each sampled table, as separate grants. Revoking
--   anon cannot strip logged-in access. PUBLIC held nothing.
--
-- THE FOUR pde_* TABLES ARE THE INTERESTING ONES
--   pde_certificates, pde_badges, pde_learner_badges and pde_reputation each
--   carried a PERMISSIVE policy granting SELECT TO public USING (true), named as
--   though it existed to serve the public certificate-verification page at
--   /verify/[number]. It did not.
--
--   That page calls /api/certificates/verify/[number], which resolves through
--   lib/services/certificates/verify-resolver.ts using createServiceRoleClient()
--   — and service_role bypasses RLS entirely. So the public policy served the
--   verification flow nothing at all, while granting any anonymous visitor the
--   right to enumerate EVERY learner's certificates, badges and reputation.
--
--   All four were empty, so nothing had leaked yet. proxy.ts even carries the
--   note "pde_certificates was empty so it stayed latent". Emptiness was the only
--   thing standing between this and a real exposure the day PDE goes live.
--
--   Verified AFTER applying that verification still works:
--     GET https://www.jkkn.ai/verify/JKKN-TEST-0000            -> 200 (renders)
--     GET https://www.jkkn.ai/api/certificates/verify/ABC123   -> 404
--                                        {"valid":false,"status":"not_found"}
--   A clean not-found, not a 500 — the service-role path is unaffected.
--
-- NOT TOUCHED: castes and community_categories stay anon-readable. The
-- unauthenticated admission form reads them with the browser anon client, and
-- closing them breaks intake. Re-proven HTTP 200 after this ran, deliberately.
-- ============================================================================

REVOKE ALL ON TABLE public.assignment_rule_type_registry  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.bos_po_pso_mapping             FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.events_stalls                  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_category_upgrade_fees   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hostel_program_eligibility     FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hr_peer_benchmarks             FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hr_recruitment_signal_inputs   FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hr_regulatory_bodies           FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hr_regulatory_norms            FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.hr_specializations             FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.marathon_checkpoint_scans      FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.marathon_checkpoints           FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.marathon_race_track_points     FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.marathon_race_tracks           FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.marathon_results               FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.nps_analytics                  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.page_metadata                  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.pde_badges                     FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.pde_certificates               FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.pde_learner_badges             FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.pde_reputation                 FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_approval_workflows     FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_budget_categories      FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_labels                 FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_priorities             FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_statuses               FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_templates              FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.project_types                  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.resource_maintenance_logs      FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.resource_maintenance_schedules FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.subcategories                  FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.usage_events_archive           FROM anon, PUBLIC;

-- RLS is on and working here; it served no rows to anon. Closed anyway so the
-- table does not depend on a single policy staying correct forever.
REVOKE ALL ON TABLE public.ims_user_store_grants          FROM anon, PUBLIC;

-- ============================================================================
-- VERIFICATION (run in a SEPARATE call — the Management API wraps a submitted
-- batch in one transaction, so an in-batch check proves nothing).
--
-- Observed after apply, over HTTPS with the real anon key:
--   pde_certificates, pde_learner_badges, pde_reputation, marathon_results,
--   usage_events_archive, project_statuses, subcategories,
--   ims_user_store_grants            -> all HTTP 401
--   castes, community_categories     -> still HTTP 200 (intentional)
--
-- And the sweep itself now reports:
--   4 relation(s) reachable by the anon key
--   approved 4 · grandfathered 0 · escalated 0 · unapproved 0
-- ============================================================================
