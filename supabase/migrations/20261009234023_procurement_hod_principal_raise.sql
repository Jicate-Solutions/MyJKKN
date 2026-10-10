-- Purchase requests: HoDs, principals and office assistants may raise them, and a HoD's
-- request is approved by their own college's principal first.
-- Director rulings, 2026-10-09 23:18 and 23:25 (adoption desk):
--   1. "Purchase requests are raised by store keepers/office staff AND HoDs & principals AND
--      the central office."  → hod, principal and office_assistant get procurement.request_create.
--   2. A HoD's purchase request goes to their own college's principal first; only then to the
--      procurement office. A principal's or an office assistant's request is unchanged.
--
-- How (no parallel mechanism — the category approval chain does it):
--   * procurement_request_chain_steps(category, college, requester) = the chain the request
--     already gets (procurement_chain_steps, 'request' list) with ONE extra step in front,
--     "Principal approval" (role principal, same college), when the requester holds the hod
--     role and holds neither principal nor procurement_manager. Steps are renumbered 1..n.
--     The principal approves through approver_ids, like every chain step — nobody is given
--     procurement.request_approve.
--   * When the category's own list already asks this college's principal (a principal role
--     step for the same college, or a named person who holds principal here), no extra step is
--     added: that step is moved to the front instead, so the principal is asked once, FIRST.
--   * No active principal in the college → the extra step resolves to nobody, so the submit is
--     refused with "Principal approval: nobody holds the principal role in this college — ask
--     the admin to set it, then submit again." (the chain's existing rule: a request never
--     waits for no one, and nothing is ever approved on its own). The requester sees the same
--     problem in the approver preview before submitting.
--   * A principal who rejects stops the request (procurement_decide_request_step, unchanged).
--   * A HoD who also holds principal gets no extra step (no approving one's own request).
--
-- The submit trigger and the requester's preview are patched from their LIVE bodies
-- (pg_get_functiondef + replace, each pattern asserted to occur exactly once), as in
-- 20261008052910 and 20261009070838, so nothing else in them can drift from what is deployed.
-- If a live body differs from the repo-derived text, this file raises and changes nothing.
-- Re-running is a no-op (each patch is skipped when it is already in).
--
-- FILE ONLY — not applied here. Rehearsed on a throwaway PostgreSQL 16:
--   bash supabase/tests/procurement-principal-first/run.sh

-- ═══ 1. Raise permission for hod, principal, office_assistant ════════════════════════
-- jsonb merge: only this one key is written; every other key on the rows stays as it is.
UPDATE public.custom_roles
   SET permissions = coalesce(permissions, '{}'::jsonb) || '{"procurement.request_create": true}'::jsonb,
       updated_at  = now()
 WHERE role_key IN ('hod', 'principal', 'office_assistant')
   AND (permissions -> 'procurement.request_create') IS DISTINCT FROM 'true'::jsonb;

DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(k, ', ') INTO v_missing
    FROM unnest(ARRAY['hod', 'principal', 'office_assistant']) k
   WHERE NOT EXISTS (SELECT 1 FROM public.custom_roles cr
                      WHERE cr.role_key = k
                        AND cr.permissions -> 'procurement.request_create' = 'true'::jsonb);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'procurement.request_create not set for role(s): % (role row missing?)', v_missing;
  END IF;
END $$;

-- ═══ 2. Does a person hold a role (the resolver's own idiom) ══════════════════════════
-- Same test procurement_resolve_step uses for a role step: an active custom role through
-- user_roles, or the legacy single-role column on profiles.
CREATE OR REPLACE FUNCTION public.procurement_holds_role(p_user_id uuid, p_role_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN custom_roles cr ON cr.id = ur.role_id
                  WHERE ur.user_id = p_user_id AND cr.role_key = p_role_key
                    AND coalesce(cr.is_active, true))
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_user_id AND p.role = p_role_key);
$$;
-- Internal helper: only the SECURITY DEFINER functions below call it, and they run as the owner.
REVOKE ALL ON FUNCTION public.procurement_holds_role(uuid, text) FROM PUBLIC, anon, authenticated;

-- ═══ 3. A request's steps: principal first for a HoD's request ════════════════════════
CREATE OR REPLACE FUNCTION public.procurement_request_chain_steps(
  p_category_id uuid, p_institution_id uuid, p_requested_by uuid
) RETURNS SETOF public.procurement_category_approval_steps
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH chain AS (
    SELECT c.*,
           -- this step already asks this college's principal
           ((c.approver_kind = 'role' AND c.role_key = 'principal' AND c.same_college)
            OR (c.approver_kind = 'user'
                AND procurement_holds_role(c.user_id, 'principal')
                AND EXISTS (SELECT 1 FROM profiles p
                             WHERE p.id = c.user_id AND p.institution_id = p_institution_id))
           ) AS asks_principal
      FROM procurement_chain_steps(p_category_id, p_institution_id, 'request') c
  ),
  rule AS (
    SELECT (p_requested_by IS NOT NULL
            AND procurement_holds_role(p_requested_by, 'hod')
            AND NOT procurement_holds_role(p_requested_by, 'principal')
            AND NOT procurement_holds_role(p_requested_by, 'procurement_manager')
            -- a category with no list stays "no approvers set" (refused at submit, as before)
            AND EXISTS (SELECT 1 FROM chain)) AS principal_first
  ),
  principal_first AS (
    -- id NULL: this step is not a saved row; nothing reads v_step.id.
    SELECT NULL::uuid AS id, p_category_id AS category_id, 0 AS step_order,
           'Principal approval'::text AS label, 'role'::text AS approver_kind,
           'principal'::text AS role_key, true AS same_college, NULL::uuid AS user_id,
           now() AS created_at, 'request'::text AS stage, p_institution_id AS institution_id,
           0 AS grp
    WHERE (SELECT principal_first FROM rule)
      -- the category's own list already asks this college's principal: moved to the front below
      AND NOT EXISTS (SELECT 1 FROM chain c WHERE c.asks_principal)
  )
  SELECT s.id, s.category_id,
         (row_number() OVER (ORDER BY s.grp, s.step_order))::int AS step_order,
         s.label, s.approver_kind, s.role_key, s.same_college, s.user_id, s.created_at,
         s.stage, s.institution_id
  FROM (SELECT * FROM principal_first
        UNION ALL
        SELECT c.id, c.category_id, c.step_order, c.label, c.approver_kind, c.role_key,
               c.same_college, c.user_id, c.created_at, c.stage, c.institution_id,
               CASE WHEN c.asks_principal AND (SELECT principal_first FROM rule) THEN 0 ELSE 1 END
          FROM chain c) s
  ORDER BY 3;
$$;
-- Internal helper: only the SECURITY DEFINER functions below call it, and they run as the owner.
REVOKE ALL ON FUNCTION public.procurement_request_chain_steps(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ═══ 4. Use it at submit and in the requester's preview ═══════════════════════════════
DO $$
DECLARE
  d  text;
  d2 text;
  -- the steps loop at submit (the "any approvers set?" check above it stays on the plain list)
  c_loop_old constant text := $p$FROM procurement_chain_steps(NEW.category_id, NEW.institution_id, 'request') ORDER BY step_order$p$;
  c_loop_new constant text := $p$FROM procurement_request_chain_steps(NEW.category_id, NEW.institution_id, NEW.requested_by) ORDER BY step_order$p$;
  -- a role step nobody holds: say which role, instead of "has no active account"
  c_msg_old  constant text := $p$ELSE format('Approver %s (%s) has no active account$p$;
  c_msg_new  constant text := $p$WHEN 'role' THEN format('%s: nobody holds the %s role%s — ask the admin to set it, then submit again.',
                               v_step.label, v_step.role_key,
                               CASE WHEN v_step.same_college THEN ' in this college' ELSE '' END)
        ELSE format('Approver %s (%s) has no active account$p$;
  c_prev_old constant text := $p$FROM procurement_chain_steps(p_category_id, p_institution_id, 'request') s$p$;
  c_prev_new constant text := $p$FROM procurement_request_chain_steps(p_category_id, p_institution_id, (SELECT auth.uid())) s$p$;
BEGIN
  -- request approval built at submit
  d := pg_get_functiondef('public.fn_procurement_build_approval_chain()'::regprocedure);
  IF position('procurement_request_chain_steps' IN d) = 0 THEN
    IF (length(d) - length(replace(d, c_loop_old, ''))) / length(c_loop_old) <> 1 THEN
      RAISE EXCEPTION 'fn_procurement_build_approval_chain: steps loop pattern not found exactly once';
    END IF;
    IF (length(d) - length(replace(d, c_msg_old, ''))) / length(c_msg_old) <> 1 THEN
      RAISE EXCEPTION 'fn_procurement_build_approval_chain: no-approver message pattern not found exactly once';
    END IF;
    d2 := replace(replace(d, c_loop_old, c_loop_new), c_msg_old, c_msg_new);
    EXECUTE d2;
  END IF;

  -- preview shown to the requester before submitting (the caller is the requester)
  d := pg_get_functiondef('public.procurement_preview_chain(uuid,uuid,uuid)'::regprocedure);
  IF position('procurement_request_chain_steps' IN d) = 0 THEN
    IF (length(d) - length(replace(d, c_prev_old, ''))) / length(c_prev_old) <> 1 THEN
      RAISE EXCEPTION 'procurement_preview_chain: steps pattern not found exactly once';
    END IF;
    EXECUTE replace(d, c_prev_old, c_prev_new);
  END IF;
END $$;

-- Re-created above from their live bodies; lock them again in this file.
REVOKE ALL ON FUNCTION public.fn_procurement_build_approval_chain() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.procurement_preview_chain(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_preview_chain(uuid, uuid, uuid) TO authenticated;
