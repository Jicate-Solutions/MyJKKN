-- 20261203091000_referral_attribution_orphan_triage.sql
-- Added: 2026-09-12 — the attributions that name a consultant but no learner.
--
-- WHY THIS EXISTS
-- ---------------
-- consultant_lead_attributions says "this agency brought someone". 168 of its
-- 1,856 rows do not say who. Under rule 4 of the referral spec these are people
-- who may be owed money, so they may never be skipped silently and never deleted
-- — but nor can they be paid, because nobody can name the learner. The only
-- honest thing to do with them is put them in front of a human, which is what
-- this function is for. It is STABLE, so it cannot write; nothing downstream of
-- it pays or deletes anything.
--
-- MEASURED ON PRODUCTION 2026-09-12 (re-read before writing this file):
--     1,856  attributions
--       168  learner_profile_id IS NULL
--         9    ...the linked admission_lead DOES carry a learner   <- RECOVERABLE
--       159    ...the linked lead has no learner either            <- genuinely orphaned
--         0    ...admission_id set but matching no lead
--         0    ...no admission_id at all
-- The last two buckets are empty TODAY. They are still classified, because
-- intake writes to this table daily and a row that fits neither of the first two
-- must not fall out of the list unexplained — an orphan screen that silently
-- drops an orphan is the bug it exists to prevent.
--
-- THE 9 ARE THE FIND
-- ------------------
-- Their lead knows the learner; the attribution just never had the link copied
-- across. That is a fixable clerical gap, not missing information. This function
-- only SHOWS them — copying the link is a separate decision and a separate
-- screen, deliberately not built here.
--
-- WHAT IS AND IS NOT INVISIBLE (corrects a premise worth stating)
-- --------------------------------------------------------------
-- fn_referral_attribution_page (20261104010000) already resolves the learner
-- through BOTH paths with a COALESCE, so all 9 recoverable rows DO appear in the
-- year-scoped referrals page — they are mis-stated there, not missing. It is the
-- 159 that resolve to no learner on either path and therefore to no admission
-- year, so they appear under no single-year view at all. That function returns
-- their count as `unassigned`; this one returns the rows themselves, with the
-- reason each is stuck.
--
-- WHY THE REASON IS COMPUTED IN SQL
-- ---------------------------------
-- The reason is a property of the join, not of the rendering. Classifying it in
-- TypeScript would mean shipping the raw nulls to the browser and re-deriving
-- the rule in a second place, where it can drift from this one.
--
-- Contact numbers below are the lead's own and are already visible on the lead
-- record behind the same admission permissions, so nothing new is exposed.

-- THE GATE MUST MATCH THE SCREEN (measured on production 2026-09-12)
-- ------------------------------------------------------------------
-- The page, the sidebar entry (lib/sidebarMenuLink.ts) and the module's tab bar
-- all gate on admission.consultants.commissions.view. Gating this RPC on
-- is_super_admin() OR is_admin() alone would be strictly narrower than that:
--     23  users hold admission.consultants.commissions.view
--      2    ...also pass is_admin()  (profiles.is_super_admin OR
--           profiles.role IN ('admin','super_admin','administrator'))
--     21    ...would get the menu entry, the page and then an error card
-- The six role_keys holding it are admission, admission_staff, ceo, coo,
-- executive_admin_officer, managing_director — none of them an admin role, and
-- they are the people who own this queue. So the gate carries the page's own
-- permission, exactly as fn_consultant_payout_readiness (20260909062000) does
-- for the neighbouring screen on the same permission. Re-measured against the
-- live user_has_permission branches, that admits 19 of the 21; the other 2 are
-- refused by its own is_active guard, both being deactivated accounts that
-- cannot sign in at all.
--
-- SCOPE: this function is not institution-scoped, matching
-- fn_referral_attribution_page and fn_list_unlinked_consultant_referrals. That
-- is safe only while every role holding the gating permission is
-- institution_scope = 'all' — verified true for all six on 2026-09-12. Anyone
-- widening this gate further must re-check that, or add
-- role_has_institution_access() in the same change.
--
-- DEPLOY ORDER: apply this migration BEFORE the UI ships. Unlike the sibling
-- screens, this RPC does not exist in production yet, so a UI-first deploy gives
-- every viewer — admins included — a PostgREST 404 in the page's error card.

CREATE OR REPLACE FUNCTION public.fn_referral_attribution_orphans()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the gate is explicit. It must not be
  -- NARROWER than the screen it serves, or the screen is dead for the people it
  -- is shown to. See the gate note in the header.
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.consultants.commissions.view')) THEN
    RAISE EXCEPTION 'Not authorised to view referral attribution orphans';
  END IF;

  SELECT COALESCE(jsonb_agg(s.r ORDER BY s.sort_bucket, s.created_at DESC), '[]'::jsonb)
    INTO v
  FROM (
    SELECT
      -- Rows a human can actually act on come first.
      CASE WHEN al.id IS NOT NULL AND al.learner_profile_id IS NOT NULL THEN 0 ELSE 1 END AS sort_bucket,
      a.created_at,
      jsonb_build_object(
        'attribution_id',   a.id,
        'reason',
          CASE
            WHEN a.admission_id IS NULL              THEN 'no_admission_id'
            WHEN al.id IS NULL                       THEN 'lead_missing'
            WHEN al.learner_profile_id IS NOT NULL   THEN 'lead_has_learner'
            ELSE                                          'lead_not_converted'
          END,
        'consultant_id',    a.consultant_id,
        'consultant_name',  ec.name,
        'created_at',       a.created_at,
        'referral_source',  a.referral_source,
        'admission_id',     a.admission_id,
        -- Everything a human needs to identify the person WITHOUT another query.
        -- Measured across the 168: 168 carry a lead name and a phone, 146 a
        -- parent phone, 11 an application number, 7 an email. The name and the
        -- phone are what actually close one; the rest are corroboration.
        'lead_name',        COALESCE(
                              NULLIF(btrim(al.full_name), ''),
                              NULLIF(btrim(COALESCE(al.first_name, '') || ' ' || COALESCE(al.last_name, '')), '')
                            ),
        'lead_phone',       NULLIF(btrim(al.phone), ''),
        'lead_alt_phone',   NULLIF(btrim(al.alternate_phone), ''),
        'parent_name',      NULLIF(btrim(al.parent_name), ''),
        'parent_phone',     NULLIF(btrim(al.parent_phone), ''),
        'lead_email',       NULLIF(btrim(al.email), ''),
        'application_number', NULLIF(btrim(al.application_number), ''),
        'institution_name', ins.name,
        'program_name',     pr.program_name,
        'lead_created_at',  al.created_at,
        -- Who typed the lead in. When nobody else can say which learner this is,
        -- they might — the same lever the Unlinked Referrals screen learned to pull.
        'recorded_by_name', cp.full_name
      ) AS r
    FROM public.consultant_lead_attributions a
    LEFT JOIN public.admission_leads       al  ON al.id  = a.admission_id
    LEFT JOIN public.education_consultants ec  ON ec.id  = a.consultant_id
    LEFT JOIN public.institutions          ins ON ins.id = COALESCE(al.institution_id, a.institution_id)
    LEFT JOIN public.programs              pr  ON pr.id  = al.program_id
    LEFT JOIN public.profiles              cp  ON cp.id  = al.created_by
    WHERE a.learner_profile_id IS NULL
  ) s;

  RETURN v;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_referral_attribution_orphans() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_referral_attribution_orphans() TO authenticated;

COMMENT ON FUNCTION public.fn_referral_attribution_orphans() IS
  'Every consultant_lead_attributions row with no learner_profile_id (168 of 1,856 on 2026-09-12), each classified by why it is stuck: lead_has_learner (recoverable, 9), lead_not_converted (159), lead_missing (0), no_admission_id (0). Carries the consultant and the lead-side identity fields so a human can recognise the person without a second query; recoverable rows sort first, then newest first. STABLE, so it cannot write — it lists, it never links, pays or deletes.';
