-- Migration: Parent Portal — attachments for Announcements + Achievements
-- Created: 2026-06-20
--
-- Adds a JSONB attachment_urls column (array of {name, driveFileId, url}) to
-- pp_announcements and pp_achievements so staff can attach Google Drive files
-- when authoring. pp_homework already carries attachment_urls (A3 migration).
-- The single legacy pp_achievements.certificate_url stays for back-compat; the
-- portal now reads the array first and falls back to it.

ALTER TABLE public.pp_announcements
  ADD COLUMN IF NOT EXISTS attachment_urls JSONB DEFAULT '[]';

ALTER TABLE public.pp_achievements
  ADD COLUMN IF NOT EXISTS attachment_urls JSONB DEFAULT '[]';

COMMENT ON COLUMN public.pp_announcements.attachment_urls IS
  'Array of {name, driveFileId, url} attachments uploaded to Google Drive.';
COMMENT ON COLUMN public.pp_achievements.attachment_urls IS
  'Array of {name, driveFileId, url} attachments (e.g. certificates) on Google Drive.';
