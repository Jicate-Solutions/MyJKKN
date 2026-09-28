-- ─── Committee member designations (BUG-004626) ──────────────────────────────
-- 2026-09-25
--
-- Reported by the COO: "Assigning various committee members — provide edit
-- option and what their designation in the committee like main coordinator, or
-- member likewise, depending upon the responsibilities assigned."
--
-- event_committees only distinguishes lead(s) from members. This adds a
-- free-text designation per person, keyed by the name shown on the committee
-- card (member_names[] entries and external_members[].name):
--
--     {"POOMIGA G": "Main Coordinator", "SNEKA S": "Member"}
--
-- Keyed by name rather than array index because members are removed by index
-- and the arrays shift; a name key survives that. The service drops a person's
-- key when they are removed from the committee.
--
-- Writes go through /api/events/marathon/[eventId]/committees (service role,
-- gated by canManageEventOps), so no policy change is needed.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

ALTER TABLE public.event_committees
  ADD COLUMN IF NOT EXISTS member_designations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.event_committees.member_designations IS
  'Per-person designation within the committee, keyed by the displayed name (member_names[] / external_members[].name) — e.g. {"POOMIGA G": "Main Coordinator"}. BUG-004626.';

NOTIFY pgrst, 'reload schema';
