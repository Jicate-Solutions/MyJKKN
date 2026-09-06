-- ============================================================================
-- ID Cards — template design assets bucket (Canva-background workflow)
-- ============================================================================
-- Created: 2026-07-24. Applied by the orchestrator with BEGIN…ROLLBACK
-- rehearsal — NOT auto-applied by any deploy.
--
-- Card artwork (designed in Canva or any tool, exported 1014x638) is uploaded
-- here from the Admin → ID Cards → Template page and referenced by
-- id_card_templates.front_layout_json.background_image (public URL). The
-- render engine composites the learner's name/photo/QR on top of it.
--
-- PUBLIC-READ BY DESIGN: backgrounds are card artwork (logos, colors,
-- patterns) — they contain no learner data. Public read lets the render
-- engine and admin previews fetch them without signing. Writes are gated on
-- the id_cards.templates.edit permission (or admin), matching the
-- id_card_templates_edit table policy.
--
-- TIER-1 ADDITIVE / IDEMPOTENT / DROPS-NOTHING. No functions.
-- ============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'id-card-assets',
  'id-card-assets',
  true,
  6291456, -- 6 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Write access: template editors + admins only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'id_card_assets_editor_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "id_card_assets_editor_insert"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'id-card-assets'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('id_cards.templates.edit')
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'id_card_assets_editor_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "id_card_assets_editor_update"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'id-card-assets'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('id_cards.templates.edit')
        )
      )
      WITH CHECK (
        bucket_id = 'id-card-assets'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('id_cards.templates.edit')
        )
      )
    $policy$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'id_card_assets_editor_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "id_card_assets_editor_delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'id-card-assets'
        AND (
          public.is_super_admin() OR public.is_admin()
          OR public.user_has_permission('id_cards.templates.edit')
        )
      )
    $policy$;
  END IF;
END $$;

-- Explicit documentation of the intended public read (bucket is public; the
-- public URL path serves objects regardless — this covers authenticated
-- storage-API reads/lists for previews in the admin UI).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'id_card_assets_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "id_card_assets_read"
      ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'id-card-assets')
    $policy$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
