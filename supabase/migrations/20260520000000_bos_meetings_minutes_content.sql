-- ──────────────────────────────────────────────────────────────────────────────
-- BoS Meetings: Rich Minutes Content
-- ──────────────────────────────────────────────────────────────────────────────
-- Adds a structured JSONB column to hold the detailed meeting minutes that
-- the chairman drafts in a rich-text editor (TipTap). The plain-text
-- minutes_summary column stays as-is for backwards compatibility — it now
-- functions as an at-a-glance one-liner; the full document lives here.
--
-- Shape stored in minutes_content (kept in sync with TypeScript types in
-- types/bos.ts → BosMeetingMinutesContent):
--
--   {
--     "narrative_html": "<p>Rich-text body of the minutes …</p>",
--     "changes_log": [
--       {
--         "id": "uuid",
--         "syllabus_id": "uuid",      // FK to bos_course_syllabi.id (nullable: free-form item)
--         "syllabus_code": "24UCSC05",// denormalized for export rendering
--         "unit": "Unit III",
--         "topic": "Software Architecture",
--         "sub_topic": "Hexagonal Pattern",
--         "suggested_by_member_id": "uuid", // FK to bos_members.id (nullable)
--         "suggested_by_name": "Dr. M. Naveen", // denormalized
--         "suggestion_text": "Replace example with microservices case study",
--         "created_at": "ISO timestamp"
--       },
--       …
--     ]
--   }
--
-- Why JSONB (not separate tables for changes_log rows): the changes log is
-- always loaded together with the meeting, never queried independently, and
-- evolves with the editor UI. A child table would require joins on every read
-- and migrations for every field change. JSONB keeps the editor → save flow
-- a single-table UPDATE while still allowing GIN indexing if cross-meeting
-- search ever becomes a requirement.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bos_meetings
  ADD COLUMN IF NOT EXISTS minutes_content JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.bos_meetings.minutes_content IS
  'Structured rich minutes: { narrative_html: string, changes_log: ChangesLogEntry[] }. See types/bos.ts → BosMeetingMinutesContent.';
