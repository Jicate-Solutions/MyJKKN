-- ============================================================================
-- 20260530150000_instagram_lead_attribution
-- Phase 4 — Instagram outcome attribution (Agent η slice)
-- ============================================================================
-- Why: Phase 1-3 lands the IG monitoring substrate (accounts/posts/comments
-- via Agents β/γ/ζ). This migration closes the loop on the outcome side —
-- it lets admission leads be attributed back to the IG post/account that
-- drove them, and exposes a view + an admin-tunable attribution-window
-- policy for reporting on "did this learner-creator's content actually
-- produce admissions?".
--
-- Scope (deliberately narrow — see CLAUDE.md rule 22):
--   1. Add 'learner_creator_content' to lead_source enum (idempotent).
--   2. Add two nullable UUID columns on admission_leads:
--        lead_source_ig_account_id, lead_source_ig_post_id
--      Both nullable — backfill is impossible for legacy leads. No FK
--      constraints in this migration (the referenced tables ig_accounts/
--      ig_posts ship in Agent β's parallel PR; FKs land at integration
--      time so this migration can deploy independently).
--   3. Create v_ig_admission_attribution view IFF both ig_accounts and
--      ig_posts exist (DO block — fail-soft when β not yet merged).
--   4. Seed 1 platform_policies row: ig.attribution_window_days (INT, 30).
--
-- Apply path: supabase Management API POST /v1/projects/{ref}/database/query
-- (per CLAUDE.md MyJKKN rule 3 — never `supabase db push`).
--
-- Standing rule (CLAUDE.md feedback_policy_decisions_must_be_config_rows):
-- every threshold / mapping / feature-flag = a row in platform_policies +
-- a super_admin edit surface. The attribution window IS a threshold.
-- ============================================================================

-- ─── 1. Extend lead_source enum ─────────────────────────────────────────────
-- Idempotent. Mirrors the youtube_ads / whatsapp pattern (PRs #828, #735).
-- New value MUST NOT be referenced elsewhere in this same transaction —
-- Postgres requires the ALTER TYPE to commit before DML uses the value.
-- Subsequent statements in this migration only reference EXISTING enum
-- values via the column DEFAULT path, so this constraint is satisfied.
ALTER TYPE public.lead_source ADD VALUE IF NOT EXISTS 'learner_creator_content';


-- ─── 2. Attribution columns on admission_leads ──────────────────────────────
-- Nullable; legacy rows stay NULL. New leads created via the Instagram
-- attribution capture path (Agent γ's API route + Agent ζ's admin UI) set
-- both columns. Phase 5 will add the capture call sites; this migration
-- only lands the storage.
--
-- No FK constraint yet — Agent β's ig_accounts/ig_posts tables ship in a
-- parallel PR. Adding the FK here would force a merge-order dependency.
-- Follow-up migration (post-Agent β merge) will run:
--   ALTER TABLE admission_leads
--     ADD CONSTRAINT fk_lead_ig_account
--     FOREIGN KEY (lead_source_ig_account_id) REFERENCES ig_accounts(id)
--     ON DELETE SET NULL;
--   ALTER TABLE admission_leads
--     ADD CONSTRAINT fk_lead_ig_post
--     FOREIGN KEY (lead_source_ig_post_id) REFERENCES ig_posts(id)
--     ON DELETE SET NULL;
ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS lead_source_ig_account_id uuid;

ALTER TABLE public.admission_leads
  ADD COLUMN IF NOT EXISTS lead_source_ig_post_id uuid;

COMMENT ON COLUMN public.admission_leads.lead_source_ig_account_id IS
  'Instagram account (learner_creator) attributed as the source of this lead. '
  'Nullable; only populated when lead is captured via Instagram attribution flow. '
  'FK to ig_accounts.id will land in a follow-up migration after Agent β merges.';

COMMENT ON COLUMN public.admission_leads.lead_source_ig_post_id IS
  'Specific Instagram post that drove this lead, when known. Nullable even '
  'when account_id is set (campaign-level attribution without post-level signal). '
  'FK to ig_posts.id will land in a follow-up migration after Agent β merges.';

-- Indexes for the v_ig_admission_attribution aggregations + future drilldowns.
-- Partial: only non-null rows participate, keeping index size proportional
-- to actual IG-attributed leads (small fraction of total leads).
CREATE INDEX IF NOT EXISTS idx_admission_leads_ig_account
  ON public.admission_leads (lead_source_ig_account_id)
  WHERE lead_source_ig_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admission_leads_ig_post
  ON public.admission_leads (lead_source_ig_post_id)
  WHERE lead_source_ig_post_id IS NOT NULL;


-- ─── 3. Attribution view (conditional on Agent β substrate) ─────────────────
-- Drop existing view first so re-applies don't fail when ig_posts schema
-- shifts during Agent β's iteration. The IF EXISTS guard means this is
-- safe whether or not β has merged.
DROP VIEW IF EXISTS public.v_ig_admission_attribution;

DO $$
BEGIN
  IF to_regclass('public.ig_posts') IS NOT NULL
     AND to_regclass('public.ig_accounts') IS NOT NULL THEN
    -- Both Agent β tables present → create the join view.
    -- Schema reality (verified 2026-05-30 against Agent β's migration):
    --   ig_posts(id, account_id, ig_media_id, posted_at, media_type,
    --            caption, permalink, created_at)
    --   ig_accounts(id, institution_id, department_id, ig_user_id,
    --               username, account_type, connected_at, ...)
    -- institution/department live on ig_accounts → join through.
    EXECUTE $view$
      CREATE VIEW public.v_ig_admission_attribution AS
      SELECT
        p.id                                AS ig_post_id,
        p.account_id                        AS ig_account_id,
        a.institution_id                    AS institution_id,
        a.department_id                     AS department_id,
        a.username                          AS account_username,
        p.posted_at                         AS posted_at,
        p.permalink                         AS post_permalink,
        p.media_type                        AS media_type,
        COUNT(l.id)                         AS lead_count,
        COUNT(l.id) FILTER (
          WHERE l.learner_profile_id IS NOT NULL
        )                                   AS converted_lead_count,
        COUNT(l.id) FILTER (
          WHERE l.funnel_stage IN ('application_started','application_submitted')
        )                                   AS applied_lead_count
      FROM public.ig_posts p
      JOIN public.ig_accounts a ON a.id = p.account_id
      LEFT JOIN public.admission_leads l
        ON l.lead_source_ig_post_id = p.id
      GROUP BY p.id, p.account_id, a.institution_id, a.department_id,
               a.username, p.posted_at, p.permalink, p.media_type;
    $view$;

    COMMENT ON VIEW public.v_ig_admission_attribution IS
      'Per-IG-post attribution rollup: leads.count, converted_lead_count, '
      'applied_lead_count joined via admission_leads.lead_source_ig_post_id. '
      'Used by /admin/instagram-attribution drilldown UI (Phase 4 Agent η).';
  ELSE
    RAISE NOTICE 'Skipping v_ig_admission_attribution — ig_posts/ig_accounts not yet present (Agent β not merged). View will be created on the next migration apply after β lands.';
  END IF;
END $$;


-- ─── 4. Attribution-window policy seed ──────────────────────────────────────
-- Director-tunable via /admin/instagram-attribution: how many days after a
-- post a lead can still be attributed to it. Default 30 days mirrors the
-- standard ads-industry attribution window. Edit the row via the admin UI
-- (zero-deploy); do NOT edit this migration to change the default.
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system)
VALUES
  ('ig.attribution_window_days',
   'global', NULL,
   '30'::jsonb,
   'How many days after an Instagram post a lead can be attributed to it. ' ||
   'Used by the Instagram attribution capture flow and the ' ||
   '/admin/instagram-attribution drill-down reports. ' ||
   'Edit via /admin/instagram-attribution — do not edit migration.',
   'number', true)
ON CONFLICT (policy_key, scope_type,
             COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;
