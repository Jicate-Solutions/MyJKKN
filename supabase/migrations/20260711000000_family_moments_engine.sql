-- =====================================================
-- Family Moments engine — campaign-based parent engagement
-- Added: 2026-06-12 — Father's Day 2026 rollout (NV CBSE + Matric HSS)
--
-- Two tables:
--   family_moments_campaigns — one row per occasion per institution
--   family_moments           — one row per child per campaign (tokenized
--                              public gift page, WhatsApp-delivered)
--
-- Design notes:
--   * Public page reads happen SERVER-SIDE with the service-role client —
--     there are deliberately NO anon RLS policies on either table.
--     The unguessable token is the only access key.
--   * Rows are pre-seeded per learner by scripts/moments/seed-fathers-day.ts
--     (auto-card fallback), then teachers overwrite content via RLS.
--   * recipient_name / recipient_phone are SNAPSHOTS taken at seed time so a
--     later edit to learners_profiles never silently re-targets a sent link.
-- =====================================================

-- ─── 1. Campaigns ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.family_moments_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES public.institutions(id),
  slug            VARCHAR(80) NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  occasion        VARCHAR(40) NOT NULL DEFAULT 'fathers_day',
  recipient_type  VARCHAR(10) NOT NULL DEFAULT 'father'
                  CHECK (recipient_type IN ('father', 'mother', 'both')),
  card_theme      VARCHAR(40) NOT NULL DEFAULT 'fathers-day',
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'collecting', 'ready', 'sent', 'archived')),
  send_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fm_campaigns_institution
  ON public.family_moments_campaigns(institution_id);
CREATE INDEX IF NOT EXISTS idx_fm_campaigns_status
  ON public.family_moments_campaigns(status);

CREATE TRIGGER trg_fm_campaigns_updated_at
  BEFORE UPDATE ON public.family_moments_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 2. Moments (one per child per campaign) ─────────

CREATE TABLE IF NOT EXISTS public.family_moments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id        UUID NOT NULL REFERENCES public.family_moments_campaigns(id) ON DELETE CASCADE,
  learner_id         UUID NOT NULL REFERENCES public.learners_profiles(id),
  institution_id     UUID NOT NULL REFERENCES public.institutions(id),
  token              VARCHAR(64) NOT NULL UNIQUE,
  content_type       VARCHAR(10) NOT NULL DEFAULT 'auto'
                     CHECK (content_type IN ('auto', 'text', 'image')),
  message_text       TEXT,
  media_url          TEXT,
  child_name         TEXT NOT NULL,
  child_class        TEXT,
  recipient_name     TEXT,
  recipient_phone    TEXT,
  submitted_by       UUID REFERENCES public.profiles(id),
  submitted_at       TIMESTAMPTZ,
  -- engagement tracking (written server-side via service role only)
  opened_at          TIMESTAMPTZ,
  open_count         INTEGER NOT NULL DEFAULT 0,
  install_clicked_at TIMESTAMPTZ,
  push_subscribed_at TIMESTAMPTZ,
  sent_at            TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_fm_moments_campaign
  ON public.family_moments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_fm_moments_learner
  ON public.family_moments(learner_id);
CREATE INDEX IF NOT EXISTS idx_fm_moments_institution
  ON public.family_moments(institution_id);

CREATE TRIGGER trg_fm_moments_updated_at
  BEFORE UPDATE ON public.family_moments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 3. RLS ──────────────────────────────────────────
-- No anon policies on purpose: public gift page + tracking go through
-- service-role server code keyed on the unguessable token.

ALTER TABLE public.family_moments_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_moments ENABLE ROW LEVEL SECURITY;

-- Campaigns: admins, campaign viewers, and submitting teachers can read.
CREATE POLICY "fm_campaigns_select_permission" ON public.family_moments_campaigns
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    (user_has_permission('moments.campaigns.view')
     OR user_has_permission('moments.submissions.create'))
    AND role_has_institution_access(institution_id)
  )
);

-- Campaigns: only managers mutate (Phase 1 campaigns are seeded via script).
CREATE POLICY "fm_campaigns_insert_permission" ON public.family_moments_campaigns
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('moments.campaigns.manage')
      AND role_has_institution_access(institution_id))
);

CREATE POLICY "fm_campaigns_update_permission" ON public.family_moments_campaigns
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('moments.campaigns.manage')
      AND role_has_institution_access(institution_id))
);

CREATE POLICY "fm_campaigns_delete_permission" ON public.family_moments_campaigns
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('moments.campaigns.manage')
      AND role_has_institution_access(institution_id))
);

-- Moments: admins, campaign viewers, and submitting teachers can read.
CREATE POLICY "fm_moments_select_permission" ON public.family_moments
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    (user_has_permission('moments.campaigns.view')
     OR user_has_permission('moments.submissions.create'))
    AND role_has_institution_access(institution_id)
  )
);

-- Moments: teachers update content fields on pre-seeded rows.
CREATE POLICY "fm_moments_update_permission" ON public.family_moments
FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('moments.submissions.create')
      AND role_has_institution_access(institution_id))
);

-- Moments: row creation/deletion is manager-only (seed script uses service role).
CREATE POLICY "fm_moments_insert_permission" ON public.family_moments
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('moments.campaigns.manage')
      AND role_has_institution_access(institution_id))
);

CREATE POLICY "fm_moments_delete_permission" ON public.family_moments
FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('moments.campaigns.manage')
      AND role_has_institution_access(institution_id))
);

-- ─── 4. Storage bucket: family-moments (public read, gated write) ──
-- Public bucket so card images serve straight from the CDN; object paths are
-- {campaign_id}/{moment_id}.jpg — UUIDs, unguessable, same trust model as the
-- page token itself.

INSERT INTO storage.buckets (id, name, public)
VALUES ('family-moments', 'family-moments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fm_storage_insert_submitters" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'family-moments'
  AND (
    is_super_admin() OR is_admin()
    OR user_has_permission('moments.submissions.create')
    OR user_has_permission('moments.campaigns.manage')
  )
);

CREATE POLICY "fm_storage_update_submitters" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'family-moments'
  AND (
    is_super_admin() OR is_admin()
    OR user_has_permission('moments.submissions.create')
    OR user_has_permission('moments.campaigns.manage')
  )
);

CREATE POLICY "fm_storage_delete_managers" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'family-moments'
  AND (is_super_admin() OR is_admin()
       OR user_has_permission('moments.campaigns.manage'))
);

-- ─── 5. PostgREST schema reload ──────────────────────
NOTIFY pgrst, 'reload schema';
