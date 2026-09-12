-- Online Meetings — Microsoft Teams becomes a first-class link provider.
--
-- WHY
--   Every AI Pulse cycle that carries a meeting link uses a Teams URL: 10 of
--   10 measured 2026-09-09. The Champion pastes each one by hand, because
--   nothing generates them. The Director's locked decision of 2026-06-18 is
--   "Keep Teams" (specs/ai-pulse-graph-attendance-integration-2026-06-18.md),
--   and lib/services/integrations/teams-service.ts already implements the
--   Graph client-credentials flow that mints one.
--
--   So Teams is what this organisation actually runs meetings on, and the
--   module now defaults to it. `meet_source` could previously only record
--   'google' or 'manual', which would have forced a Teams-generated link to be
--   filed as a hand-pasted one and made "where did this link come from"
--   unanswerable the moment IT switches Graph on.
--
-- NOTE ON THE VALUE 'manual'
--   Unchanged and still the fallback. All four MS_GRAPH_* credentials are
--   empty on this deployment, exactly as GOOGLE_CAL_CLIENT_ID is, so every
--   meeting created today still records 'manual'. This migration only makes
--   the column able to tell the truth once that changes.

ALTER TABLE public.online_meetings
  DROP CONSTRAINT IF EXISTS online_meetings_meet_source_chk;

ALTER TABLE public.online_meetings
  ADD CONSTRAINT online_meetings_meet_source_chk
  CHECK (meet_source IN ('teams', 'google', 'manual'));

COMMENT ON COLUMN public.online_meetings.meet_source IS
  'Where meet_url came from. ''teams'' = generated via Microsoft Graph under the MS_GRAPH_ORGANIZER_USER_ID service account; ''google'' = generated on the host''s connected Google Calendar; ''manual'' = pasted by a person. Provisioning never blocks creation, so ''manual'' is the honest answer whenever neither integration is configured.';

COMMENT ON COLUMN public.online_meetings.google_event_id IS
  'Provider-side meeting id: a Google Calendar event id when meet_source=''google'', or a Graph onlineMeeting id when meet_source=''teams''. Named for the first provider that used it; read it together with meet_source, never alone.';
