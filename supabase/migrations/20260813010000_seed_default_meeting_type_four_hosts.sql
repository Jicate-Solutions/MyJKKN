-- 20260813010000_seed_default_meeting_type_four_hosts.sql
--
-- FILE ONLY / NOT APPLIED. Apply is Director-gated. This file has not been run
-- against production, not even inside a BEGIN..ROLLBACK.
--
-- WHAT IS BROKEN. Four booking pages are is_public = true and reachable, but
-- their host has ZERO rows in meeting_types -- not merely inactive or hidden
-- ones, none at all. A visitor lands on a page that works and finds nothing to
-- book. The four handles:
--
--   gobinath-k         gobinathk@jkkn.ac.in
--   mohanraj-v         mohanraj_v@jkkn.ac.in
--   mr-ravishankar-s   ravishankars@jkkn.ac.in
--   rangarajan-r       ceo@jkkn.ac.in      <- the CEO's own page
--
-- WHY SEEDING ONE TYPE IS SUFFICIENT. Verified live on production: each of the
-- four already has 1 availability schedule, 5-6 availability windows, and 1
-- ACTIVE Google Calendar connection. The meeting type is the only missing
-- piece, so adding it genuinely makes the page bookable rather than moving the
-- failure one step later.
--
-- SCOPE. Exactly one 10-minute type per host, and nothing else. is_public is
-- NOT flipped on any page, no fifth host is seeded, and no existing
-- meeting_types row is modified.
--
-- IDEMPOTENT. ON CONFLICT on uq_mt_host_slug (host_profile_id, slug) DO
-- NOTHING, so a re-run is a no-op. The slug 'quick-10' was verified free for
-- all four hosts. schedule_id and institution_id are nullable on this table but
-- are populated explicitly here -- a NULL schedule_id falls back to "the host's
-- default schedule", and naming the schedule the windows actually belong to is
-- the unambiguous choice.
--
-- Every other column relies on the table default: hidden=false, is_active=true,
-- min_notice_min=120, max_days_ahead=14, buffer_before_min=0,
-- buffer_after_min=0. kind and location_mode are written explicitly even though
-- they match their defaults, because the CHECK constraints on both are narrow.

INSERT INTO public.meeting_types (
  host_profile_id,
  institution_id,
  schedule_id,
  title,
  slug,
  duration_min,
  kind,
  location_mode,
  is_active,
  hidden
)
VALUES
  -- gobinath-k (gobinathk@jkkn.ac.in)
  (
    '36442de9-e634-475c-a8a9-c29b6a9d839e',
    'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
    '13688d48-ab1d-42e7-9fde-78a79c18dcdb',
    '10-minute meeting',
    'quick-10',
    10,
    'solo',
    'in_person',
    true,
    false
  ),
  -- mohanraj-v (mohanraj_v@jkkn.ac.in)
  (
    '829c81ad-530c-43f2-9885-62b78f82caac',
    '5de4fba1-4564-41ed-8c73-5d948b74b843',
    '202645fa-4ed2-484b-885e-3df0881095e8',
    '10-minute meeting',
    'quick-10',
    10,
    'solo',
    'in_person',
    true,
    false
  ),
  -- mr-ravishankar-s (ravishankars@jkkn.ac.in)
  (
    'dfbe273b-0540-4c32-9bad-e9bfb19a6460',
    '5de4fba1-4564-41ed-8c73-5d948b74b843',
    '58609f78-f1db-445e-b535-09faf47115eb',
    '10-minute meeting',
    'quick-10',
    10,
    'solo',
    'in_person',
    true,
    false
  ),
  -- rangarajan-r (ceo@jkkn.ac.in)
  (
    '5ad97b8b-0edb-4857-886b-449d8d3df538',
    '5de4fba1-4564-41ed-8c73-5d948b74b843',
    'e7696ac0-c21e-4c48-80aa-69b91c8c8bf6',
    '10-minute meeting',
    'quick-10',
    10,
    'solo',
    'in_person',
    true,
    false
  )
ON CONFLICT (host_profile_id, slug) DO NOTHING;
