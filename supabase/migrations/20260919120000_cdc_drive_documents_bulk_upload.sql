-- =============================================================================
-- CDC Drives — per-learner documents (offer / appointment / joining letters …)
-- and bulk-upload batches.
-- =============================================================================
-- Bytes live in Google Drive:
--   CDC / Campus Drives / {Company} - {Drive Date} / Offer Letters / …
-- This DB stores the Drive FILE id and FOLDER id (never just a URL), the batch
-- the file arrived in, and a version chain. Nothing is overwritten silently:
-- a replaced or superseded row stays, flagged is_current = false.
--
-- Additive + idempotent. Ships as a FILE — apply out of band.
-- Writes: service role behind the cdc.drives.edit gate.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cdc_drive_document_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code      text NOT NULL UNIQUE,           -- e.g. OFF-2026-0001
  drive_id        uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  document_type   text NOT NULL,
  status          text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'completed_with_errors', 'abandoned')),
  total_files     integer NOT NULL DEFAULT 0,
  matched         integer NOT NULL DEFAULT 0,
  uploaded        integer NOT NULL DEFAULT 0,
  failed          integer NOT NULL DEFAULT 0,
  no_match        integer NOT NULL DEFAULT 0,
  multiple_match  integer NOT NULL DEFAULT 0,
  existing_found  integer NOT NULL DEFAULT 0,
  skipped         integer NOT NULL DEFAULT 0,
  -- Per-file outcome for the audit: [{file_name, outcome, learner_id?, register_number?, reason?}]
  results         jsonb NOT NULL DEFAULT '[]'::jsonb,
  uploaded_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_document_batches_drive ON public.cdc_drive_document_batches (drive_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.cdc_drive_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id         uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  learner_id       uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  -- Snapshot of the identifiers the file was matched on (audit; master data stays in learners_profiles).
  register_number  text,
  roll_number      text,
  document_type    text NOT NULL CHECK (document_type IN (
                     'offer_letter', 'appointment_letter', 'joining_letter',
                     'internship_letter', 'training_letter', 'salary_letter', 'other')),
  file_name        text NOT NULL,          -- name stored in Drive
  original_name    text,                   -- name as uploaded
  mime_type        text,
  size_bytes       integer,
  drive_file_id    text NOT NULL,
  drive_folder_id  text,
  batch_id         uuid REFERENCES public.cdc_drive_document_batches(id) ON DELETE SET NULL,
  upload_method    text NOT NULL DEFAULT 'single' CHECK (upload_method IN ('single', 'bulk')),
  version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  is_current       boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'verified', 'rejected', 'replaced', 'superseded')),
  uploaded_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_documents_drive_type ON public.cdc_drive_documents (drive_id, document_type, is_current);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_documents_learner ON public.cdc_drive_documents (learner_id);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_documents_batch ON public.cdc_drive_documents (batch_id);
-- One CURRENT document per learner per type per drive.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cdc_drive_documents_current
  ON public.cdc_drive_documents (drive_id, learner_id, document_type)
  WHERE is_current;

ALTER TABLE public.cdc_drive_document_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drive_documents        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdc_drive_document_batches_read" ON public.cdc_drive_document_batches;
CREATE POLICY "cdc_drive_document_batches_read" ON public.cdc_drive_document_batches
  FOR SELECT USING (public.is_cdc_staff());

-- A learner may see the rows of their OWN documents (the bytes still go through
-- the authenticated proxy /api/cdc/drives/[id]/documents/[docId]).
DROP POLICY IF EXISTS "cdc_drive_documents_read" ON public.cdc_drive_documents;
CREATE POLICY "cdc_drive_documents_read" ON public.cdc_drive_documents
  FOR SELECT USING (
    public.is_cdc_staff()
    OR learner_id IN (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
  );
