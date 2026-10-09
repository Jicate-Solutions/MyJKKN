-- 20271009100500_ai_tool_catalog_reenable_13_lookups.sql
--
-- WHAT
--   Turns back on the 13 read-only assistant lookups that
--   20270301090000_ai_tool_catalog.sql (PR #3982, section 2b(a)) seeded with
--   enabled = false because every call failed:
--     11 called public.ai_rpc_accessible_scope(uuid), which exists nowhere;
--     ai_rpc_academic_context read academic_years.is_current (no such column);
--     ai_rpc_admission_analytics nested COUNT(*) inside jsonb_object_agg.
--   20270308090000_ai_rpc_repair_dead_scope_lookups.sql (PR #3999, merged
--   2026-09-28) rewrote all 13 bodies, but nothing switched them back on.
--   The 2b(a) comment says: turn each back on "only after its function is
--   fixed". This file is that step: one UPDATE of enabled on 13 rows.
--   One more change, Director's ruling 2026-10-09: bug_report_details
--   returns error logs and an IP address, so it goes to the in-app assistant
--   ONLY, never the outside-AI door (as export_data already is).
--   requires_permission, params and every other catalog row are untouched;
--   the other 12 keep their seeded ['assistant','door'].
--
-- GUARD
--   The DO block refuses (and nothing changes) unless, on this database:
--     every one of the 13 functions exists;
--     every one of the 13 calls a college-scope check —
--       public.role_has_institution_access( or public._user_accessible_institutions( —
--       so a body with no tenant filter can never be switched on;
--     the 11 that called the missing helper carry 20270308090000's
--       "[scope-repair 2026-09-24]" marker (its repaired scope lines);
--     none of them still calls ai_rpc_accessible_scope(;
--     ai_rpc_academic_context no longer reads is_current;
--     ai_rpc_admission_analytics no longer nests the aggregate
--       (the same marker 20270308090000's own self-check uses).
--   All matches are case-insensitive regular expressions on the live body.
--
-- NOT PROVEN HERE
--   2b(a) also asks that "a call as a real person returns rows". That needs a
--   signed-in call on production and is left to the Director (ask the
--   assistant) after this applies.
--
-- ORDER
--   Needs 20270308090000 (#3999) applied; the guard refuses otherwise. Works
--   with ai_rpc_academic_context from either #3999 or the newer
--   20270421090000 (#4088, applied live 2026-10-09) — both pass the guard and
--   the pg test proves each.
--   bug_report_details is narrowed to the assistant BEFORE anything is
--   switched on, so there is no moment when the door could read it.
--
-- Re-running is a no-op. Undo (the audience narrowing is the Director's
-- ruling and is meant to stay; the second line is only for a full revert):
--   UPDATE public.ai_tool_catalog SET enabled = false, updated_at = now()
--    WHERE kind = 'rpc' AND target IN (<the 13 below>);
--   UPDATE public.ai_tool_catalog SET audience = ARRAY['assistant','door']::text[], updated_at = now()
--    WHERE kind = 'rpc' AND target = 'ai_rpc_bug_report_details';
-- Re-applying 20270301090000 after this file switches the 13 off again
-- (its section 2b) — the applier runs each version once, so only a manual
-- re-apply would do that.

DO $guard$
DECLARE
  v_targets text[] := ARRAY[
    'ai_rpc_academic_years', 'ai_rpc_attendance_summary', 'ai_rpc_bug_report_details',
    'ai_rpc_courses', 'ai_rpc_degrees', 'ai_rpc_faculty_assignments', 'ai_rpc_periods',
    'ai_rpc_staff_details', 'ai_rpc_staff_plans', 'ai_rpc_timetable_slots', 'ai_rpc_timetables',
    'ai_rpc_academic_context',
    'ai_rpc_admission_analytics'
  ];
  -- the 11 that called the missing scope helper and were repaired by 20270308090000
  v_scope_repaired text[] := v_targets[1:11];
  v_missing text;
  v_bad text;
BEGIN
  SELECT string_agg(t, ', ' ORDER BY t) INTO v_missing
    FROM unnest(v_targets) AS t
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = t);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION '20271009100500: function(s) missing, nothing turned on: %', v_missing;
  END IF;

  SELECT string_agg(DISTINCT p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_targets)
     AND p.prosrc !~* '(role_has_institution_access|_user_accessible_institutions)\s*\(';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '20271009100500: no college-scope check in the live body, nothing turned on: %', v_bad;
  END IF;

  SELECT string_agg(DISTINCT p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_scope_repaired)
     AND position('[scope-repair 2026-09-24]' IN p.prosrc) = 0;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '20271009100500: 20270308090000''s scope repair is not in the live body (apply it first), nothing turned on: %', v_bad;
  END IF;

  SELECT string_agg(DISTINCT p.proname, ', ') INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_targets)
     AND p.prosrc ~* 'ai_rpc_accessible_scope\s*\(';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '20271009100500: still calls the missing ai_rpc_accessible_scope (apply 20270308090000 first), nothing turned on: %', v_bad;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ai_rpc_academic_context'
       AND p.prosrc ~* '\mis_current\M'
  ) THEN
    RAISE EXCEPTION '20271009100500: ai_rpc_academic_context still reads is_current, nothing turned on';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'ai_rpc_admission_analytics'
       AND p.prosrc ~* 'jsonb_object_agg\s*\(\s*to_char\s*\(\s*created_at'
  ) THEN
    RAISE EXCEPTION '20271009100500: ai_rpc_admission_analytics still nests an aggregate, nothing turned on';
  END IF;
END
$guard$;

-- Director 2026-10-09: bug report details reach the in-app assistant only.
-- Narrowed FIRST, so the door never sees it switched on.
UPDATE public.ai_tool_catalog
   SET audience = ARRAY['assistant']::text[], updated_at = now()
 WHERE kind = 'rpc'
   AND target = 'ai_rpc_bug_report_details'
   AND audience IS DISTINCT FROM ARRAY['assistant']::text[];

UPDATE public.ai_tool_catalog
   SET enabled = true, updated_at = now()
 WHERE kind = 'rpc'
   AND enabled = false
   AND target IN (
     'ai_rpc_academic_years', 'ai_rpc_attendance_summary', 'ai_rpc_bug_report_details',
     'ai_rpc_courses', 'ai_rpc_degrees', 'ai_rpc_faculty_assignments', 'ai_rpc_periods',
     'ai_rpc_staff_details', 'ai_rpc_staff_plans', 'ai_rpc_timetable_slots', 'ai_rpc_timetables',
     'ai_rpc_academic_context',
     'ai_rpc_admission_analytics'
   );
