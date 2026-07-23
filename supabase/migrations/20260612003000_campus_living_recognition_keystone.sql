-- ============================================================================
-- Campus Living Recognition — cross-module event stream (CARE keystone)
-- ============================================================================
-- Date: 2026-06-12
-- Spec: specs/choose-your-menu-platform-spec-2026-06-11.md (§recognition) +
--       JKKN CARE Audit Framework v1.0 (campus-living scored 18/80, R = 0 —
--       this stream is the #1 corrective: input becomes publicly attributable).
--
-- Generalises the mess-only `mess_choose_recognition` (P0 substrate, ZERO rows
-- and ZERO writers — the platform is dark) into ONE stream every campus-living
-- module fires into: mess today; housekeeping, community, maintenance, events
-- as they grow return-arcs. The resident "Your wins" feed and the public
-- "Hostel wins" feed both read from here, so recognition renders module-
-- agnostically — a new module needs only to INSERT, never to build a feed.
--
-- Integrity property: recognition is CONFERRED, never claimed. Residents have
-- NO insert path — rows are written by system processes / SECURITY DEFINER
-- writer RPCs that ship with each input mode. RLS write = admin only in v1.
--
-- SECURITY: feed RPC = SECURITY DEFINER + REVOKE FROM anon, PUBLIC + GRANT TO
-- authenticated (Supabase default-grants anon on every new function).
-- Idempotent. Applied via exec_sql AFTER Director approval (show-SQL-first).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────
-- 1. The stream
-- ────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.campus_living_recognition (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  -- Open vocabulary by design (no CHECK): 'mess' today; 'housekeeping',
  -- 'community', 'maintenance', 'events', … as modules grow return-arcs.
  module      text NOT NULL,
  -- Per-module event vocabulary (mess: vote_landed / proposal_approved /
  -- choice_served). The firing module owns its vocab.
  event_type  text NOT NULL,
  -- Display-ready plain-English line, written by the firing module — keeps
  -- the feed components module-agnostic ("A dish you voted for made the menu").
  title       text NOT NULL,
  -- The specific thing recognised (dish name, slot, proposal title…).
  detail      text,
  -- Module-specific keys for deep links (item_id, menu_week, booking_id…).
  ref         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Public = appears on the attributable "Hostel wins" feed (the CARE point).
  -- False = private ping to the resident only.
  is_public   boolean NOT NULL DEFAULT true,
  fired_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cl_recognition_learner
  ON public.campus_living_recognition (learner_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_cl_recognition_public_feed
  ON public.campus_living_recognition (fired_at DESC) WHERE is_public;
CREATE INDEX IF NOT EXISTS idx_cl_recognition_module
  ON public.campus_living_recognition (module, fired_at DESC);

-- ────────────────────────────────────────────────────────────────────────
-- 2. Carry over any mess rows, then retire the mess-only table.
--    (0 rows at authoring time — the INSERT…SELECT is correctness insurance
--    in case rows appear between authoring and application.)
-- ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.mess_choose_recognition') IS NOT NULL THEN
    INSERT INTO public.campus_living_recognition
      (learner_id, module, event_type, title, detail, ref, is_public, fired_at)
    SELECT
      learner_id,
      'mess',
      event_type,
      CASE event_type
        WHEN 'vote_landed'       THEN 'A dish you voted for made the menu'
        WHEN 'proposal_approved' THEN 'Your special-day proposal was approved'
        WHEN 'choice_served'     THEN 'Your meal pick was served'
        ELSE 'Recognised'
      END,
      dish_name,
      jsonb_strip_nulls(jsonb_build_object('item_id', item_id, 'menu_week', menu_week)),
      true,
      COALESCE(fired_at, now())
    FROM public.mess_choose_recognition;

    DROP TABLE public.mess_choose_recognition;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- 3. RLS — read: own rows always, public rows for any signed-in user,
--    admin everything. Write: admin only (recognition is conferred — the
--    writer RPCs that ship with each input mode are SECURITY DEFINER).
-- ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.campus_living_recognition ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cl_recognition_select ON public.campus_living_recognition;
CREATE POLICY cl_recognition_select ON public.campus_living_recognition
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR is_public
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.learner_id = campus_living_recognition.learner_id
    )
  );

DROP POLICY IF EXISTS cl_recognition_write_admin ON public.campus_living_recognition;
CREATE POLICY cl_recognition_write_admin ON public.campus_living_recognition
  FOR ALL USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ────────────────────────────────────────────────────────────────────────
-- 4. Public feed RPC — attributable wins with CONTROLLED columns only.
--    Names are the point (CARE Recognition = attributable), but the RPC
--    exposes only the resident's first name — never roll/phone/profile.
-- ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_campus_living_recognition_feed(
  p_module text DEFAULT NULL,
  p_limit  int  DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v FROM (
    SELECT
      r.id,
      r.module,
      r.event_type,
      r.title,
      r.detail,
      r.fired_at,
      COALESCE(NULLIF(split_part(lp.first_name, ' ', 1), ''), 'A resident') AS first_name
    FROM public.campus_living_recognition r
    JOIN public.learners_profiles lp ON lp.id = r.learner_id
    WHERE r.is_public
      AND (p_module IS NULL OR r.module = p_module)
    ORDER BY r.fired_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) t;

  RETURN jsonb_build_object('results', v);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_campus_living_recognition_feed(text, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_campus_living_recognition_feed(text, int) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- 5. Config row — feed kill-switch (config-table pattern: every policy
--    decision = a config row). Harmless while the stream is empty.
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, enum_options, is_system)
VALUES
  ('campus_living.recognition.feed_enabled', 'global', NULL, 'true'::jsonb,
   'Show the public "Hostel wins" recognition feed on resident surfaces. The stream itself keeps recording regardless.', 'boolean', NULL, true)
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

NOTIFY pgrst, 'reload schema';
