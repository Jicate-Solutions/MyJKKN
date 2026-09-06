-- Migration: MBA Associate — assignment-scoped analyst access
-- Date: 2026-07-24
-- Ships DORMANT. No behaviour changes until the frontend PR wires the service
-- and the Director creates postings. Applying it is safe/no-op for the parts
-- that already exist live (the 7 views + the mba_learner_analyst role are
-- version-captured here to close a DR gap — they were applied via the Mgmt API
-- and existed only in a scratchpad until now).
--
-- WHAT THIS DOES
--   1. Version-captures the `mba_learner_analyst` NOLOGIN pg-role (idempotent).
--   2. Version-captures the 7 de-identified "learning_*" analyst views as
--      CREATE OR REPLACE VIEW matching the LIVE defs verbatim (no-op on prod;
--      seeds a fresh/DR database). Views stay LOCKED — readable only by the
--      analyst role; `authenticated`/`anon` are NOT granted. The RPC below is
--      the only door for app users.
--   3. `mba_associate_postings` — which Associate is posted to which department.
--   4. `mba_area_analyst_views` — which views belong to which department +
--      whether each is financially sensitive. Seeded by resolving
--      improvement_areas.key (DR-safe) so admissions/events map correctly even
--      if area UUIDs differ after a rebuild.
--   5. `fn_mba_analyst_views(p_area_id)` — SECDEF delivery RPC. Guards on role +
--      posting, reads the mapped views as owner, applies k>=5 small-cell
--      suppression per view, returns JSONB. anon-locked.
--
-- ⚠️ SENSITIVE: the money views (learning_collection_summary, learning_channel_roi,
-- learning_event_budget_actual) are delivered to ANY Associate posted to their
-- department. is_sensitive=true flags them; a per-assignment financial toggle is
-- an easy follow-up. Director gates the actual data exposure by choosing whom to
-- post (no postings exist until the Director creates them).

BEGIN;

-- ============================================================================
-- 1. Analyst pg-role (version-capture; NOLOGIN, 0 members by design)
-- ============================================================================
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mba_learner_analyst') THEN
    CREATE ROLE mba_learner_analyst NOLOGIN;
  END IF;
END
$role$;

-- ============================================================================
-- 2. Version-capture the 7 de-identified analyst views (verbatim live defs).
--    CREATE OR REPLACE VIEW is a no-op on prod (identical defs); on a fresh DB
--    it recreates them. Behaviour is NOT changed.
-- ============================================================================
CREATE OR REPLACE VIEW public.learning_admission_funnel AS
 SELECT l.institution_id,
    i.name AS institution,
    COALESCE(l.funnel_stage::text, 'unspecified'::text) AS funnel_stage,
    COALESCE(l.academic_year, 'unspecified'::text) AS academic_year,
    date_trunc('month'::text, l.created_at)::date AS lead_month,
    count(*) AS lead_count,
    count(*) FILTER (WHERE l.is_lost) AS lost_count,
    count(*) FILTER (WHERE l.is_dormant) AS dormant_count,
    round(avg(l.conversion_probability), 3) AS avg_conversion_probability
   FROM admission_leads l
     LEFT JOIN institutions i ON i.id = l.institution_id
  GROUP BY l.institution_id, i.name, (COALESCE(l.funnel_stage::text, 'unspecified'::text)), (COALESCE(l.academic_year, 'unspecified'::text)), (date_trunc('month'::text, l.created_at)::date);

CREATE OR REPLACE VIEW public.learning_channel_roi AS
 SELECT l.institution_id,
    i.name AS institution,
    l.source::text AS source,
    count(*) AS leads,
    count(*) FILTER (WHERE l.funnel_stage::text = ANY (ARRAY['application_started'::text, 'application_submitted'::text, 'confirmed'::text, 'token_paid'::text, 'applied'::text])) AS progressed,
    count(*) FILTER (WHERE l.is_lost) AS lost,
    round(100.0 * count(*) FILTER (WHERE l.funnel_stage::text = ANY (ARRAY['application_started'::text, 'application_submitted'::text, 'confirmed'::text, 'token_paid'::text, 'applied'::text]))::numeric / NULLIF(count(*), 0)::numeric, 1) AS progression_rate_pct
   FROM admission_leads l
     LEFT JOIN institutions i ON i.id = l.institution_id
  GROUP BY l.institution_id, i.name, (l.source::text);

CREATE OR REPLACE VIEW public.learning_collection_summary AS
 SELECT r.institution_id,
    i.name AS institution,
    date_trunc('month'::text, r.receipt_date::timestamp with time zone)::date AS collection_month,
    r.payment_mode,
    count(*) AS receipts,
    sum(r.payment_amount) AS total_collected,
    round(avg(r.payment_amount), 2) AS avg_receipt
   FROM billing_receipts r
     LEFT JOIN institutions i ON i.id = r.institution_id
  GROUP BY r.institution_id, i.name, (date_trunc('month'::text, r.receipt_date::timestamp with time zone)::date), r.payment_mode;

CREATE OR REPLACE VIEW public.learning_conversion_gaps AS
 SELECT COALESCE(h.from_stage::text, '(start)'::text) AS from_stage,
    h.to_stage::text AS to_stage,
    date_trunc('month'::text, h.created_at)::date AS transition_month,
    count(*) AS transition_count
   FROM admission_lead_stage_history h
  GROUP BY (COALESCE(h.from_stage::text, '(start)'::text)), (h.to_stage::text), (date_trunc('month'::text, h.created_at)::date);

CREATE OR REPLACE VIEW public.learning_event_attendance AS
 SELECT e.id AS event_id,
    e.name AS event_name,
    e.institution_id,
    e.status AS event_status,
    e.event_date,
    count(r.id) AS registrations,
    count(r.id) FILTER (WHERE r.checked_in) AS checked_in,
    round(100.0 * count(r.id) FILTER (WHERE r.checked_in)::numeric / NULLIF(count(r.id), 0)::numeric, 1) AS attendance_rate_pct
   FROM events e
     LEFT JOIN events_registrations r ON r.event_id = e.id
  GROUP BY e.id, e.name, e.institution_id, e.status, e.event_date;

CREATE OR REPLACE VIEW public.learning_event_budget_actual AS
 SELECT b.event_id,
    e.name AS event_name,
    b.institution_id,
    b.category,
    count(*) AS line_items,
    sum(b.estimated_amount) AS estimated_total,
    sum(b.actual_amount) AS actual_total,
    sum(b.actual_amount) - sum(b.estimated_amount) AS variance
   FROM event_budget_items b
     LEFT JOIN events e ON e.id = b.event_id
  GROUP BY b.event_id, e.name, b.institution_id, b.category;

CREATE OR REPLACE VIEW public.learning_event_feedback AS
 SELECT f.event_id,
    e.name AS event_name,
    f.institution_id,
    count(*) AS responses,
    round(avg(f.rating), 2) AS avg_rating,
    count(*) FILTER (WHERE f.rating <= 2) AS low_ratings,
    count(*) FILTER (WHERE f.rating >= 4) AS high_ratings
   FROM event_session_feedback f
     LEFT JOIN events e ON e.id = f.event_id
  GROUP BY f.event_id, e.name, f.institution_id;

-- Keep the views LOCKED to the analyst role only (mirrors live). The SECDEF RPC
-- reads them as owner; authenticated/anon are intentionally never granted.
GRANT SELECT ON public.learning_admission_funnel   TO mba_learner_analyst;
GRANT SELECT ON public.learning_channel_roi         TO mba_learner_analyst;
GRANT SELECT ON public.learning_collection_summary  TO mba_learner_analyst;
GRANT SELECT ON public.learning_conversion_gaps     TO mba_learner_analyst;
GRANT SELECT ON public.learning_event_attendance    TO mba_learner_analyst;
GRANT SELECT ON public.learning_event_budget_actual TO mba_learner_analyst;
GRANT SELECT ON public.learning_event_feedback      TO mba_learner_analyst;

-- ============================================================================
-- 3. mba_associate_postings — assignment of an Associate to a department.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_associate_postings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  associate_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  area_id           uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  assigned_by       uuid,                                  -- who created the posting (profiles.id, not FK-enforced)
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (associate_user_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_mba_postings_associate
  ON public.mba_associate_postings (associate_user_id);
CREATE INDEX IF NOT EXISTS idx_mba_postings_area_active
  ON public.mba_associate_postings (area_id, is_active);

COMMENT ON TABLE public.mba_associate_postings IS
  'Assignment-scoped access: which MBA Associate is posted to which improvement_area (department). An active posting is what unlocks that department''s analyst views via fn_mba_analyst_views.';

DROP TRIGGER IF EXISTS trg_mba_postings_updated_at ON public.mba_associate_postings;
CREATE TRIGGER trg_mba_postings_updated_at
  BEFORE UPDATE ON public.mba_associate_postings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. mba_area_analyst_views — which views belong to which department.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_area_analyst_views (
  area_id      uuid    NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  view_name    text    NOT NULL,
  is_sensitive boolean NOT NULL DEFAULT false,
  PRIMARY KEY (area_id, view_name)
);

COMMENT ON TABLE public.mba_area_analyst_views IS
  'Maps improvement_area -> de-identified learning_* analyst views, with a financial-sensitivity flag. Seeded below; managers may re-map via improvement.board.manage.';

-- Seed: resolve areas by KEY (DR-safe — area UUIDs may differ after a rebuild).
--   admissions department  <- admission-domain views
--   events department      <- event-domain views
-- Money views (channel_roi, collection_summary, event_budget_actual) => is_sensitive=true.
-- NOTE: learning_collection_summary is fee-collection data and could equally live
-- under the 'finance' department; it is mapped to 'admissions' per the build
-- contract (fee collection tracks admission yield). Re-map to 'finance' later if desired.
INSERT INTO public.mba_area_analyst_views (area_id, view_name, is_sensitive)
SELECT a.id, v.view_name, v.is_sensitive
FROM (VALUES
  ('admissions', 'learning_admission_funnel',    false),
  ('admissions', 'learning_conversion_gaps',     false),
  ('admissions', 'learning_channel_roi',         true),   -- money view
  ('admissions', 'learning_collection_summary',  true),   -- money view
  ('events',     'learning_event_attendance',    false),
  ('events',     'learning_event_feedback',      false),
  ('events',     'learning_event_budget_actual', true)    -- money view
) AS v(area_key, view_name, is_sensitive)
JOIN public.improvement_areas a ON a.key = v.area_key
ON CONFLICT (area_id, view_name) DO UPDATE SET is_sensitive = EXCLUDED.is_sensitive;

-- ============================================================================
-- 5. RLS on the two tables
-- ============================================================================
ALTER TABLE public.mba_associate_postings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mba_area_analyst_views   ENABLE ROW LEVEL SECURITY;

-- Postings: improvement.board.manage holders CRUD everything.
DROP POLICY IF EXISTS "mba_postings_manage_all" ON public.mba_associate_postings;
CREATE POLICY "mba_postings_manage_all" ON public.mba_associate_postings
FOR ALL
USING (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
)
WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
);

-- Postings: an Associate may SELECT their own posting rows (to see their scope).
DROP POLICY IF EXISTS "mba_postings_associate_read_own" ON public.mba_associate_postings;
CREATE POLICY "mba_postings_associate_read_own" ON public.mba_associate_postings
FOR SELECT
USING (associate_user_id = auth.uid());

-- View map: managers CRUD; any authenticated user may read the (non-sensitive)
-- catalog metadata. The actual view DATA is gated by the RPC, not this table.
DROP POLICY IF EXISTS "mba_area_views_manage_all" ON public.mba_area_analyst_views;
CREATE POLICY "mba_area_views_manage_all" ON public.mba_area_analyst_views
FOR ALL
USING (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
)
WITH CHECK (
  is_super_admin() OR is_admin() OR user_has_permission('improvement.board.manage')
);

DROP POLICY IF EXISTS "mba_area_views_read" ON public.mba_area_analyst_views;
CREATE POLICY "mba_area_views_read" ON public.mba_area_analyst_views
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- ============================================================================
-- 6. Delivery RPC — the ONLY door to the analyst views for app users.
--    Guard: caller holds mba_associate OR improvement.board.manage, AND
--           (is posted to p_area_id with is_active) OR improvement.board.manage.
--    Applies k>=5 small-cell suppression per view.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_analyst_views(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_manage    boolean;
  v_is_assoc  boolean;
  v_posted    boolean;
  v_rec       record;
  v_guard_col text;
  v_where     text;
  v_rows      jsonb;
  v_views     jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  v_manage := is_super_admin() OR is_admin()
              OR user_has_permission('improvement.board.manage');

  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND cr.role_key = 'mba_associate'
      AND cr.is_active
  ) INTO v_is_assoc;

  -- Gate 1: must be an MBA Associate or a board manager.
  IF NOT (v_is_assoc OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: MBA Associate role or improvement.board.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM mba_associate_postings p
    WHERE p.associate_user_id = v_uid
      AND p.area_id = p_area_id
      AND p.is_active
  ) INTO v_posted;

  -- Gate 2: must be posted to THIS department (managers bypass — they see any).
  IF NOT (v_posted OR v_manage) THEN
    RAISE EXCEPTION 'not authorized: no active posting to this department'
      USING ERRCODE = '42501';
  END IF;

  -- Deliver each mapped view with k>=5 small-cell suppression.
  FOR v_rec IN
    SELECT view_name, is_sensitive
    FROM mba_area_analyst_views
    WHERE area_id = p_area_id
    ORDER BY view_name
  LOOP
    -- Per-view "underlying individuals" count column. This CASE is ALSO the
    -- allowlist of readable relations: an unknown view_name is skipped, so the
    -- dynamic read can never touch an arbitrary relation.
    --   NULL  => the view has no individual-level count column (event financials);
    --            k>=5 is not applicable, rows pass. The is_sensitive flag + the
    --            posting gate are the controls for that view.
    v_guard_col := CASE v_rec.view_name
      WHEN 'learning_admission_funnel'    THEN 'lead_count'        -- leads
      WHEN 'learning_channel_roi'         THEN 'leads'             -- leads
      WHEN 'learning_collection_summary'  THEN 'receipts'          -- receipts (payers)
      WHEN 'learning_conversion_gaps'     THEN 'transition_count'  -- leads transitioning
      WHEN 'learning_event_attendance'    THEN 'registrations'     -- registrants
      WHEN 'learning_event_feedback'      THEN 'responses'         -- respondents
      WHEN 'learning_event_budget_actual' THEN NULL                -- event financials: no individuals
      ELSE '__unknown__'
    END;

    IF v_guard_col = '__unknown__' THEN
      CONTINUE;  -- not an allowlisted analyst view
    END IF;

    IF v_guard_col IS NULL THEN
      v_where := 'TRUE';
    ELSE
      -- Drop any group representing fewer than 5 underlying individuals.
      v_where := format('%I >= 5', v_guard_col);
    END IF;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t WHERE %s',
      v_rec.view_name, v_where
    ) INTO v_rows;

    v_views := v_views || jsonb_build_object(
      'view_name',    v_rec.view_name,
      'is_sensitive', v_rec.is_sensitive,
      'rows',         v_rows
    );
  END LOOP;

  RETURN jsonb_build_object(
    'area_id', p_area_id,
    'views',   v_views
  );
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_analyst_views(uuid) IS
  'Assignment-scoped delivery of de-identified analyst views for one improvement_area. Guards on mba_associate role + active posting (improvement.board.manage bypasses). Applies k>=5 small-cell suppression per view. Returns {area_id, views:[{view_name,is_sensitive,rows[]}]}.';

-- Anon lock-out (Supabase default ALTER DEFAULT PRIVILEGES otherwise grants anon EXECUTE).
REVOKE EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_analyst_views(uuid) TO authenticated;

-- ============================================================================
-- 7. Associate picker for the assignment UI.
--    Must be SECDEF: `user_roles` SELECT is self-scoped for anyone without
--    is_admin/is_super_admin/roles.edit, so a board manager (improvement.board.manage
--    but not roles.edit) reading user_roles directly would see only their OWN row
--    and get a truncated/empty picker (a silent failure). This reads as owner and
--    guards to board managers, returning the 44 active MBA Associate members.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_list_associates()
RETURNS TABLE (user_id uuid, name text, email text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('improvement.board.manage')) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT DISTINCT p.id, p.full_name, p.email
    FROM user_roles ur
    JOIN custom_roles cr ON cr.id = ur.role_id
    JOIN profiles p ON p.id = ur.user_id
    WHERE cr.role_key = 'mba_associate' AND cr.is_active
    ORDER BY p.full_name;
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_list_associates() IS
  'Board-manager-only picker source: active MBA Associate members (id, full_name, email). SECDEF because user_roles SELECT is self-scoped for non-admins.';

REVOKE EXECUTE ON FUNCTION public.fn_mba_list_associates() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_list_associates() TO authenticated;

COMMIT;
