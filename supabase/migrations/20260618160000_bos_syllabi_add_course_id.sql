-- ─────────────────────────────────────────────────────────────────────────────
-- Anchor bos_course_syllabi to the stable COE course id.
--
-- course_code is a MUTABLE snapshot: COE occasionally renames a course_code,
-- which breaks the link between a syllabus and its COE course. course_id (the
-- COE course's stable id) is immutable, so we store it as the canonical link and
-- keep course_code/course_name as fallback display snapshots.
--
-- ADDITIVE / non-breaking:
--   • course_code, course_name and the existing unique constraints
--     (regulation_id, course_code, version_number) are unchanged.
--   • course_id is nullable; it is backfilled by a one-time script
--     (scripts/backfill-bos-syllabi-course-id.mjs) and set on new rows by the
--     write path. Switching constraints/FKs to course_id is a later phase.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.bos_course_syllabi
  add column if not exists course_id varchar(64);

comment on column public.bos_course_syllabi.course_id is
  'Stable COE course id (BosCourseMaster.id). Canonical link to the COE course; course_code/course_name are fallback snapshots that COE may rename.';

create index if not exists idx_bos_course_syllabi_course_id
  on public.bos_course_syllabi using btree (course_id);
