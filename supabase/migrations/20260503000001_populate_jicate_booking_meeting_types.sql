-- =============================================================================
-- jicate-booking integration — populate jicate_booking_meeting_types
-- Migration: populate_jicate_booking_meeting_types
-- Companion to: 20260502000005_create_jicate_booking_meeting_types.sql (substrate)
--               20260502000014_seed_jicate_booking_meeting_types.sql  (placeholder)
-- Spec: specs/jicate-booking-integration-f4-f7-spec.md §3.1 + §3.3
-- =============================================================================
--
-- Source data: live SELECT against jicate-booking-prod
-- (Supabase project_ref fkihmsuwruohdgsqvnxg) on 2026-05-03 ~07:20 IST.
-- Snapshot was 5 active (hidden=false) EventTypes:
--
--   id |      slug       |         title          | length
--   ---+-----------------+------------------------+--------
--    1 | 15min           | 15 min meeting         | 15
--    2 | 30min           | 30 min meeting         | 30
--   10 | engg-counseling | Engineering Counseling | 30
--   11 | pharm-admission | Pharmacy Admission Q&A | 45
--   12 | ahs-briefing    | Allied Health Briefing | 20
--
-- internal_kind + meeting_for proposals follow the heuristic in
-- scripts/jicate-booking/list-event-types.ts, with HUMAN OVERRIDES applied
-- to the rows where the literal substring match misreads intent (see
-- inline comments per row).
--
-- Re-run safety: ON CONFLICT (cal_event_type_id) DO UPDATE — running this
-- migration twice produces the same final state as running it once.
-- =============================================================================

INSERT INTO public.jicate_booking_meeting_types
  (cal_event_type_id, cal_event_type_slug, internal_kind, meeting_for, display_name, is_active)
VALUES
  -- id=1: generic Cal.com default. No JKKN-specific intent. Marking is_active=false
  --       so it doesn't pollute /meetings/inbox UI. Director can flip on if desired.
  (1, '15min', 'other', 'counselor', '15 min meeting', false),

  -- id=2: same story as id=1 — generic Cal.com default.
  (2, '30min', 'other', 'counselor', '30 min meeting', false),

  -- id=10: heuristic matches 'counsel' substring → admission_call/counselor. ✓ correct.
  (10, 'engg-counseling', 'admission_call', 'counselor', 'Engineering Counseling', true),

  -- id=11: heuristic matched 'admin' substring → office_hours/admin (WRONG — overridden).
  --        Real intent is "Pharmacy Admission Q&A" — prospect-facing admission counseling.
  --        Override: admission_call / counselor.
  (11, 'pharm-admission', 'admission_call', 'counselor', 'Pharmacy Admission Q&A', true),

  -- id=12: no slug pattern match → defaults to other/counselor (WEAK — overridden).
  --        "Allied Health Briefing" is a prospect-facing informational session.
  --        Override: admission_call / counselor (closest fit until 'briefing' kind exists).
  (12, 'ahs-briefing', 'admission_call', 'counselor', 'Allied Health Briefing', true)

ON CONFLICT (cal_event_type_id) DO UPDATE SET
  cal_event_type_slug = EXCLUDED.cal_event_type_slug,
  internal_kind       = EXCLUDED.internal_kind,
  meeting_for         = EXCLUDED.meeting_for,
  display_name        = EXCLUDED.display_name,
  is_active           = EXCLUDED.is_active,
  updated_at          = now();
