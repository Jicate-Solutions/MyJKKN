-- =====================================================
-- Solutions Hub Pipeline Phase C1a
-- Substrate: prospect file attachments
-- Created: 2026-05-02
-- Purpose: Track files uploaded against a prospect (proposals, RFPs,
--          MoU drafts, contracts, misc). Files live in a private
--          Storage bucket; this table is the index + ACL anchor.
-- =====================================================

-- =====================================================
-- 1. TABLE: sh_prospect_attachments
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sh_prospect_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES public.sh_prospects(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type TEXT,
    kind TEXT NOT NULL DEFAULT 'other'
        CHECK (kind IN ('proposal', 'rfp', 'mou_draft', 'contract', 'other')),
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.sh_prospect_attachments IS
    'Files attached to a Solutions Hub prospect. Storage objects live in the
     sh-prospect-attachments private bucket; this table is the index + ACL anchor.';

COMMENT ON COLUMN public.sh_prospect_attachments.storage_path IS
    'Object path within the sh-prospect-attachments bucket (no leading slash).';

COMMENT ON COLUMN public.sh_prospect_attachments.kind IS
    'Document classification: proposal | rfp | mou_draft | contract | other.';

-- =====================================================
-- 2. INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_sh_prospect_attachments_prospect_id
    ON public.sh_prospect_attachments (prospect_id);

CREATE INDEX IF NOT EXISTS idx_sh_prospect_attachments_prospect_kind
    ON public.sh_prospect_attachments (prospect_id, kind);

-- =====================================================
-- 3. ROW LEVEL SECURITY
-- Mirrors sh_prospects policies: management reads/writes,
-- staff reads, admin only deletes.
-- =====================================================

ALTER TABLE public.sh_prospect_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sh_prospect_attachments_select" ON public.sh_prospect_attachments;
DROP POLICY IF EXISTS "sh_prospect_attachments_insert" ON public.sh_prospect_attachments;
DROP POLICY IF EXISTS "sh_prospect_attachments_update" ON public.sh_prospect_attachments;
DROP POLICY IF EXISTS "sh_prospect_attachments_delete" ON public.sh_prospect_attachments;

CREATE POLICY "sh_prospect_attachments_select" ON public.sh_prospect_attachments
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_prospect_attachments_insert" ON public.sh_prospect_attachments
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospect_attachments_update" ON public.sh_prospect_attachments
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_prospect_attachments_delete" ON public.sh_prospect_attachments
    FOR DELETE USING (
        sh_has_management_access()
    );

-- =====================================================
-- 4. STORAGE BUCKET: sh-prospect-attachments (private)
-- =====================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('sh-prospect-attachments', 'sh-prospect-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- =====================================================
-- 5. STORAGE OBJECT POLICIES
-- Restrict to bucket_id = 'sh-prospect-attachments' AND
-- caller has Solutions Hub management access. SELECT/INSERT/DELETE only.
-- =====================================================

DROP POLICY IF EXISTS "sh_prospect_attachments_objects_select"
    ON storage.objects;
DROP POLICY IF EXISTS "sh_prospect_attachments_objects_insert"
    ON storage.objects;
DROP POLICY IF EXISTS "sh_prospect_attachments_objects_delete"
    ON storage.objects;

CREATE POLICY "sh_prospect_attachments_objects_select"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'sh-prospect-attachments'
        AND sh_has_management_access()
    );

CREATE POLICY "sh_prospect_attachments_objects_insert"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'sh-prospect-attachments'
        AND sh_has_management_access()
    );

CREATE POLICY "sh_prospect_attachments_objects_delete"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'sh-prospect-attachments'
        AND sh_has_management_access()
    );
