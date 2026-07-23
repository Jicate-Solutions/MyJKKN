-- ============================================================================
-- Consultant Portal Access Policy — config-row substrate
-- ============================================================================
-- Created: 2026-05-13
-- Director's STANDING RULE (memory feedback_policy_decisions_must_be_config_rows.md):
-- every policy decision = config-table row + super_admin UI to write + reader fn
-- that materializes the policy. Zero deploys, zero PRs, zero developer
-- round-trips for future tweaks.
--
-- Anti-pattern this substrate retires
-- -----------------------------------
-- Hardcoded role-string allowlists (see
-- memory/feedback_strict_counselor_override_list_traps_senior_leadership.md):
-- a literal array like ['super_admin','consultant'] silently traps any senior
-- staff whose role-mix doesn't appear in the array. We replace that with a
-- principal-typed config table where ANY role/permission/user_id can be added
-- as a row without a code deploy.
--
-- What this substrate ships
-- -------------------------
-- 1. Config table `consultant_portal_access_policy` packing three concerns via
--    a `rule_type` discriminator (mirrors `admission_assignment_rules`):
--      - portal_login_allowed   → who can load /consultant-portal at all
--      - rls_read_own_data      → which principals get the additive RLS read
--      - preview_as_consultant  → which roles may use see-as-user to enter
-- 2. RLS on the policy table (SELECT for any authenticated user so the reader
--    fn works; writes super_admin only).
-- 3. Seed rows mirroring today's minimum viable behaviour 1:1
--    (super_admin + consultant for the first two rules; super_admin + director
--     for preview-as).
-- 4. Two ADDITIVE permissive RLS policies that fix the "consultant-portal
--    pages return empty arrays for portal users" bug:
--      - consultant_lead_attributions_self_read
--      - consultant_commission_transactions_self_read
--    Both check `education_consultants.user_id = auth.uid() AND status='active'`
--    via EXISTS so the policy is index-friendly. Existing permission-based
--    policies (20260507130001) are LEFT INTACT — these are additive.
--
-- This PR ships ONLY the substrate. The engine code that READS these rows
-- (middleware gate + see-as-user role allowlist) lands in a follow-up PR;
-- this table sits initially next to the existing hardcoded checks (same
-- pattern as admission_assignment_rules and counselor_tier_policy when
-- they first landed).
--
-- Companion service:   lib/services/admission/consultant-portal-access-service.ts
-- Companion admin UI:  app/(routes)/admin/consultants/portal-access/page.tsx
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Config table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultant_portal_access_policy (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type           text NOT NULL CHECK (rule_type IN (
                        'portal_login_allowed',
                        'rls_read_own_data',
                        'preview_as_consultant'
                      )),
  principal_type      text NOT NULL CHECK (principal_type IN ('role','permission','user')),
  -- role: matches profiles.role OR custom_roles.role_key
  -- permission: a permission key like 'admission.consultants.portal.view'
  -- user: a profiles.id UUID rendered as text
  principal_value     text NOT NULL,
  display_label       text NOT NULL,
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.profiles(id)
);

COMMENT ON TABLE public.consultant_portal_access_policy IS
  'Director config: principal-typed allowlist driving consultant-portal gate, additive RLS for self-read, and see-as-user preview list. One row per (rule_type, principal_type, principal_value). See PR feat/consultant-portal-substrate (2026-05-13).';

COMMENT ON COLUMN public.consultant_portal_access_policy.rule_type IS
  'portal_login_allowed = can load /consultant-portal at all. rls_read_own_data = principal that gets the additive RLS self-read on attribution/commission rows. preview_as_consultant = roles permitted to use see-as-user to enter the portal.';

COMMENT ON COLUMN public.consultant_portal_access_policy.principal_type IS
  'role = match against profiles.role OR custom_roles.role_key. permission = match against a permission key. user = direct profile UUID match.';

COMMENT ON COLUMN public.consultant_portal_access_policy.principal_value IS
  'Value depends on principal_type. For role: a role_key string (e.g., super_admin, consultant). For permission: a permission key (e.g., admission.consultants.portal.view). For user: a profiles.id UUID as text.';

-- Unique on (rule_type, principal_type, principal_value) prevents duplicate
-- rules for the same principal under the same rule_type. Allows the SAME
-- principal to appear across DIFFERENT rule_types (e.g., super_admin in all
-- three) — which is the whole point of the discriminator.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultant_portal_access
  ON public.consultant_portal_access_policy (rule_type, principal_type, principal_value);

-- Covering index for the reader fn's hot path (filter by rule_type + active).
CREATE INDEX IF NOT EXISTS idx_consultant_portal_access_active
  ON public.consultant_portal_access_policy (rule_type, is_active);

-- ---------------------------------------------------------------------------
-- 2) updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_consultant_portal_access_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consultant_portal_access_updated_at
  ON public.consultant_portal_access_policy;

CREATE TRIGGER trg_consultant_portal_access_updated_at
  BEFORE UPDATE ON public.consultant_portal_access_policy
  FOR EACH ROW EXECUTE FUNCTION public.fn_consultant_portal_access_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS on the policy table
--    SELECT: any authenticated user (reader fn calls this without an admin
--      session; consultant-portal middleware needs to read it on every login).
--    INSERT/UPDATE/DELETE: super_admin only.
-- ---------------------------------------------------------------------------
ALTER TABLE public.consultant_portal_access_policy ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultant_portal_access_select
  ON public.consultant_portal_access_policy;
CREATE POLICY consultant_portal_access_select
  ON public.consultant_portal_access_policy
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS consultant_portal_access_write
  ON public.consultant_portal_access_policy;
CREATE POLICY consultant_portal_access_write
  ON public.consultant_portal_access_policy
  FOR ALL USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 4) Seed — mirrors today's minimum viable behaviour 1:1.
--    Idempotent: only inserts rows that don't already exist (matched on the
--    unique (rule_type, principal_type, principal_value) key).
-- ---------------------------------------------------------------------------
INSERT INTO public.consultant_portal_access_policy
  (rule_type, principal_type, principal_value, display_label, is_active, notes)
SELECT * FROM (VALUES
  ('portal_login_allowed',  'role', 'super_admin', 'Super Admin',
   true, 'Always allowed.'),
  ('portal_login_allowed',  'role', 'consultant',  'Consultant (active)',
   true, 'Granted to any user with a row in education_consultants where user_id matches and status = active. The portal layout checks this consultant record directly; this rule documents and authorizes the role.'),
  ('rls_read_own_data',     'role', 'super_admin', 'Super Admin',
   true, 'RLS bypass.'),
  ('rls_read_own_data',     'role', 'consultant',  'Consultant (active)',
   true, 'Reads own consultant_lead_attributions / consultant_commission_transactions rows via the additive self-read RLS policies in this migration.'),
  ('preview_as_consultant', 'role', 'super_admin', 'Super Admin (preview-as)',
   true, 'Cookie-swap via see-as-user.'),
  ('preview_as_consultant', 'role', 'director',    'Director (preview-as)',
   true, 'Cookie-swap via see-as-user.')
) AS s(rule_type, principal_type, principal_value, display_label, is_active, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM public.consultant_portal_access_policy p
   WHERE p.rule_type      = s.rule_type
     AND p.principal_type = s.principal_type
     AND p.principal_value = s.principal_value
);

-- ---------------------------------------------------------------------------
-- 5) Additive RLS — consultant_lead_attributions self-read
-- ---------------------------------------------------------------------------
-- Bug being fixed
-- ---------------
-- The existing SELECT policy `lead_attributions_select` (migration
-- 20260507130001) requires permission `admission.leads.view`. External
-- consultants logging in to the consultant portal do NOT hold this permission
-- — so `useCommissionTransactions` / `useLeadAttributions` return empty
-- arrays even when the consultant has rows in these tables.
--
-- Fix
-- ---
-- ADD a parallel permissive policy that allows SELECT when the row's
-- consultant_id maps (via education_consultants.user_id) to the current
-- auth.uid() AND the consultant is active. Existing policies are NOT dropped.
-- Postgres OR-joins multiple permissive policies, so admin/permission-holding
-- users continue to see everything they always saw, AND consultants now see
-- their own rows. EXISTS keeps it index-friendly (idx_attributions_consultant
-- on consultant_id; uniqueness on education_consultants.id).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS consultant_lead_attributions_self_read
  ON public.consultant_lead_attributions;
CREATE POLICY consultant_lead_attributions_self_read
  ON public.consultant_lead_attributions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.education_consultants ec
       WHERE ec.id      = consultant_lead_attributions.consultant_id
         AND ec.user_id = (SELECT auth.uid())
         AND ec.status  = 'active'
    )
  );

COMMENT ON POLICY consultant_lead_attributions_self_read
  ON public.consultant_lead_attributions IS
  'Additive policy (does not replace lead_attributions_select). Lets a logged-in active consultant SELECT their own attribution rows for the /consultant-portal/* pages. Permission-based access for admission staff is preserved by the original policy.';

-- ---------------------------------------------------------------------------
-- 6) Additive RLS — consultant_commission_transactions self-read
-- ---------------------------------------------------------------------------
-- Same shape as the attribution policy above. The transaction row carries
-- consultant_id directly (FK to education_consultants.id), so we don't need
-- to traverse the attribution table to map back to user_id.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS consultant_commission_transactions_self_read
  ON public.consultant_commission_transactions;
CREATE POLICY consultant_commission_transactions_self_read
  ON public.consultant_commission_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM public.education_consultants ec
       WHERE ec.id      = consultant_commission_transactions.consultant_id
         AND ec.user_id = (SELECT auth.uid())
         AND ec.status  = 'active'
    )
  );

COMMENT ON POLICY consultant_commission_transactions_self_read
  ON public.consultant_commission_transactions IS
  'Additive policy. Lets a logged-in active consultant SELECT their own commission transaction rows in /consultant-portal/commissions. SELECT-only — writes remain locked to admission staff / super_admin via existing policies.';

-- ---------------------------------------------------------------------------
-- 7) Reader fn — single RPC entry point for the engine.
--    Returns rule rows for a given rule_type, filtered to is_active=true.
--    SECURITY DEFINER so the engine can call it without each caller having
--    SELECT permission on the table (RLS already grants SELECT to all
--    authenticated, but DEFINER makes the contract explicit).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_get_consultant_portal_access(p_rule_type text)
RETURNS TABLE (
  id              uuid,
  rule_type       text,
  principal_type  text,
  principal_value text,
  display_label   text,
  notes           text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT id, rule_type, principal_type, principal_value, display_label, notes
    FROM public.consultant_portal_access_policy
   WHERE rule_type = p_rule_type
     AND is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.fn_get_consultant_portal_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_consultant_portal_access(text) TO service_role;

COMMENT ON FUNCTION public.fn_get_consultant_portal_access(text) IS
  'Reader for consultant_portal_access_policy. Returns active rules for a given rule_type. Consumed by consultant-portal-access-service.ts in the engine PR.';
