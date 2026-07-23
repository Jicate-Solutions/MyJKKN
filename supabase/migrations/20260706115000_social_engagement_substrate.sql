-- 2026-07-06 — Department Engagement Loop, PR1 substrate. Pilot: jkkn_publichealthdentistry.
-- Turns a broadcast handle into a participatory loop (contributor rota + contribution pipeline
-- + real-signal recognition + concern channel). Built ON social_dept_accounts / ig_posts /
-- ig_post_metrics. Fixes the CARRE gaps: Clarity (owner+brief), Empowerment (rota), Appreciation
-- (thank-you on post), Recognition (contributor board on saves+shares+comments), Respect (channel).

-- ── Owner + brief on the registry (Clarity) ──
ALTER TABLE public.social_dept_accounts
  ADD COLUMN IF NOT EXISTS purpose_line     text,
  ADD COLUMN IF NOT EXISTS content_playbook text;

-- ── Contributor rota — who owns the handle each week (Empowerment) ──
CREATE TABLE IF NOT EXISTS public.social_contributor_rota (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_account_id        uuid NOT NULL REFERENCES public.social_dept_accounts(id) ON DELETE CASCADE,
  week_start             date NOT NULL,
  contributor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  status                 text NOT NULL DEFAULT 'assigned',  -- assigned | active | done | skipped
  note                   text,
  assigned_by            uuid REFERENCES public.profiles(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dept_account_id, week_start)
);
CREATE INDEX IF NOT EXISTS ix_scr_dept_week ON public.social_contributor_rota(dept_account_id, week_start);

-- ── Contributions — member submits work → owner reviews → posted (Appreciation) ──
CREATE TABLE IF NOT EXISTS public.social_contributions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_account_id        uuid NOT NULL REFERENCES public.social_dept_accounts(id) ON DELETE CASCADE,
  contributor_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  title                  text,
  caption                text,
  media_url              text,
  status                 text NOT NULL DEFAULT 'submitted', -- submitted | approved | posted | declined
  ig_post_id             uuid REFERENCES public.ig_posts(id),  -- links to real signal once posted
  review_note            text,
  reviewed_by            uuid REFERENCES public.profiles(id),
  reviewed_at            timestamptz,
  thanked_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_sc_dept_status ON public.social_contributions(dept_account_id, status);
CREATE INDEX IF NOT EXISTS ix_sc_contributor ON public.social_contributions(contributor_profile_id);

-- ── Concern reports — a safe channel about a post (Respect / RS5) ──
CREATE TABLE IF NOT EXISTS public.social_concern_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dept_account_id     uuid NOT NULL REFERENCES public.social_dept_accounts(id) ON DELETE CASCADE,
  reporter_profile_id uuid REFERENCES public.profiles(id),
  post_ref            text,
  reason              text NOT NULL,
  status              text NOT NULL DEFAULT 'open',  -- open | reviewing | resolved
  resolution          text,
  resolved_by         uuid REFERENCES public.profiles(id),
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ──
ALTER TABLE public.social_contributor_rota ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_contributions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_concern_reports ENABLE ROW LEVEL SECURITY;

-- helper: may this user MANAGE this handle? (admin / social.manage / the named owner)
CREATE OR REPLACE FUNCTION public.fn_social_can_manage_handle(p_dept_account_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_super_admin() OR is_admin() OR user_has_permission('social.manage')
      OR EXISTS (SELECT 1 FROM public.social_dept_accounts d
                 WHERE d.id = p_dept_account_id AND d.accountable_owner_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.fn_social_can_manage_handle(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_social_can_manage_handle(uuid) TO authenticated;

-- Rota: any authenticated member can SEE the rota; only handle-managers change it.
DROP POLICY IF EXISTS scr_select ON public.social_contributor_rota;
CREATE POLICY scr_select ON public.social_contributor_rota FOR SELECT
  USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS scr_manage ON public.social_contributor_rota;
CREATE POLICY scr_manage ON public.social_contributor_rota FOR ALL
  USING (public.fn_social_can_manage_handle(dept_account_id))
  WITH CHECK (public.fn_social_can_manage_handle(dept_account_id));

-- Contributions: a member sees/creates their OWN; handle-managers see/curate all for the handle.
DROP POLICY IF EXISTS sc_select ON public.social_contributions;
CREATE POLICY sc_select ON public.social_contributions FOR SELECT
  USING (contributor_profile_id = auth.uid() OR public.fn_social_can_manage_handle(dept_account_id));
DROP POLICY IF EXISTS sc_insert ON public.social_contributions;
CREATE POLICY sc_insert ON public.social_contributions FOR INSERT
  WITH CHECK (contributor_profile_id = auth.uid());
DROP POLICY IF EXISTS sc_update_owner ON public.social_contributions;
CREATE POLICY sc_update_owner ON public.social_contributions FOR UPDATE
  USING (public.fn_social_can_manage_handle(dept_account_id)
         OR (contributor_profile_id = auth.uid() AND status = 'submitted'))
  WITH CHECK (public.fn_social_can_manage_handle(dept_account_id)
         OR (contributor_profile_id = auth.uid() AND status = 'submitted'));

-- Concerns: reporter creates/sees own; handle-managers see + resolve.
DROP POLICY IF EXISTS scn_select ON public.social_concern_reports;
CREATE POLICY scn_select ON public.social_concern_reports FOR SELECT
  USING (reporter_profile_id = auth.uid() OR public.fn_social_can_manage_handle(dept_account_id));
DROP POLICY IF EXISTS scn_insert ON public.social_concern_reports;
CREATE POLICY scn_insert ON public.social_concern_reports FOR INSERT
  WITH CHECK (reporter_profile_id = auth.uid() OR reporter_profile_id IS NULL);
DROP POLICY IF EXISTS scn_update ON public.social_concern_reports;
CREATE POLICY scn_update ON public.social_concern_reports FOR UPDATE
  USING (public.fn_social_can_manage_handle(dept_account_id))
  WITH CHECK (public.fn_social_can_manage_handle(dept_account_id));

-- ── Table-level anon lockdown (defense-in-depth; verified anon has no default table grant
--    in this project, but make it explicit + future-proof — mirrors the RPC anon-lock rule) ──
REVOKE ALL ON public.social_contributor_rota  FROM anon, PUBLIC;
REVOKE ALL ON public.social_contributions     FROM anon, PUBLIC;
REVOKE ALL ON public.social_concern_reports   FROM anon, PUBLIC;
GRANT  SELECT, INSERT, UPDATE ON public.social_contributor_rota TO authenticated;
GRANT  SELECT, INSERT, UPDATE ON public.social_contributions    TO authenticated;
GRANT  SELECT, INSERT, UPDATE ON public.social_concern_reports  TO authenticated;
