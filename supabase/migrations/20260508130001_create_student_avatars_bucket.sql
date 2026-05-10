-- ============================================================================
-- 20260508130001 — Create student-avatars storage bucket
-- ============================================================================
-- Public-read bucket for student selfies captured via the QR self-fill form.
-- Uploads happen via service-role at /api/student-form/[token]/photo;
-- public-read so admission desk and the student's own form can render the
-- thumbnail. Contents are scoped to {learner_id}/{token_id}.jpg paths.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-avatars', 'student-avatars', true)
ON CONFLICT (id) DO NOTHING;
