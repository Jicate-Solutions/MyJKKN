-- ============================================================================
-- Migration: 20260520000000_hostel_community_posts
-- Module: Campus Living — Community noticeboard
-- ============================================================================
-- Author: Agent ξ (community + PM tasks page wiring, 2026-05-20)
--
-- Adds `hostel_community_posts` to back the /campus-living/community page.
-- Pairs with the pre-existing `hostel_community_config` (visibility flags)
-- and `community_categories` table. (Note: community_categories on prod is
-- actually caste-categories — unfortunate name collision; the post category
-- here is a free-text `post_type` enum, NOT a FK to community_categories.)
--
-- Schema choices:
--   - Per-institution (RLS scoped by institution_id).
--   - Optional block_id for per-block noticeboards (NULL = whole-hostel).
--   - post_type enum covers the four content types the config table toggles:
--       announcement | event | poll | discussion
--   - author_id references profiles(id) so wardens, residents, and admins
--     can all post (UI gates which roles can create which type).
--   - is_pinned + is_published for moderation; pinned posts float top.
--
-- Apply via Management API:
--   POST /v1/projects/{ref}/database/query
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hostel_community_post_type') THEN
    CREATE TYPE public.hostel_community_post_type AS ENUM (
      'announcement',
      'event',
      'poll',
      'discussion'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.hostel_community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.hostel_blocks(id) ON DELETE SET NULL,
  post_type hostel_community_post_type NOT NULL DEFAULT 'announcement',
  title text NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  event_date timestamptz,
  poll_options jsonb,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hostel_community_posts_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT hostel_community_posts_body_len CHECK (char_length(body) BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS hcp_inst_pinned_created_idx
  ON public.hostel_community_posts (institution_id, is_pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS hcp_inst_type_idx
  ON public.hostel_community_posts (institution_id, post_type);

CREATE INDEX IF NOT EXISTS hcp_block_idx
  ON public.hostel_community_posts (block_id) WHERE block_id IS NOT NULL;

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.hostel_community_posts_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hcp_updated_at ON public.hostel_community_posts;
CREATE TRIGGER trg_hcp_updated_at
  BEFORE UPDATE ON public.hostel_community_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.hostel_community_posts_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.hostel_community_posts ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user in the same institution can see published posts.
DROP POLICY IF EXISTS hcp_read_same_inst ON public.hostel_community_posts;
CREATE POLICY hcp_read_same_inst
  ON public.hostel_community_posts
  FOR SELECT
  TO authenticated
  USING (
    is_published = true
    AND (
      institution_id IN (
        SELECT institution_id FROM public.profiles WHERE id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND cr.role_key IN ('super_admin', 'administrator')
      )
    )
  );

-- Insert: super_admin / administrator / hostel wardens / authors within same institution.
DROP POLICY IF EXISTS hcp_insert_same_inst ON public.hostel_community_posts;
CREATE POLICY hcp_insert_same_inst
  ON public.hostel_community_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key IN ('super_admin', 'administrator')
    )
  );

-- Update: author OR admin in same institution.
DROP POLICY IF EXISTS hcp_update_author_or_admin ON public.hostel_community_posts;
CREATE POLICY hcp_update_author_or_admin
  ON public.hostel_community_posts
  FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key IN ('super_admin', 'administrator')
    )
  );

-- Delete: admin only.
DROP POLICY IF EXISTS hcp_delete_admin ON public.hostel_community_posts;
CREATE POLICY hcp_delete_admin
  ON public.hostel_community_posts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = auth.uid()
        AND cr.role_key IN ('super_admin', 'administrator')
    )
  );

COMMENT ON TABLE public.hostel_community_posts IS
  'Hostel community noticeboard: announcements, events, polls, discussions. '
  'Per-institution, optionally per-block. Companion to hostel_community_config '
  '(visibility toggles). Added 2026-05-20 by Agent ξ.';
