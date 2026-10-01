-- ============================================================================
-- Migration: 20260928140000_health_surveys_banner
-- Wellness Surveys — optional header banner image per survey.
-- ============================================================================
-- banner_url holds the PUBLIC URL of an image in the health-survey-media bucket.
-- The bucket is public-read because the banner renders on the no-login public
-- page (/ws/<token>) with a plain <img>; a signed URL would expire while the
-- survey is still live. WRITES go only through
-- /api/health/surveys/[surveyId]/banner (service role), which first proves the
-- caller can update the survey through their own RLS (health.programs.manage).
-- Same model as event-form-media (app/api/events/[eventId]/form-media).
--
-- TIER: additive. Idempotent.
-- ============================================================================

ALTER TABLE public.health_surveys
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'health-survey-media',
  'health-survey-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
