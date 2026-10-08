-- Rehearsal for 20271008150000_personal_key_meeting_booking.sql on a throwaway PostgreSQL 16.
-- Load personal-key-booking-stub.sql, apply the migration (twice), then run this file.
\set ON_ERROR_STOP 0
SET ROLE authenticated;
-- A owns key a, has meetings.view
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
SELECT 'A on own key' t, public.fn_ai_personal_key_set_booking('10000000-0000-0000-0000-00000000000a', true);
SELECT 'A list' t, public.fn_ai_personal_key_booking_ids();
SELECT 'A on B key' t, public.fn_ai_personal_key_set_booking('10000000-0000-0000-0000-00000000000b', true);
SELECT 'A on admin key' t, public.fn_ai_personal_key_set_booking('10000000-0000-0000-0000-0000000000ad', true);
SELECT 'A on turned-off key' t, public.fn_ai_personal_key_set_booking('10000000-0000-0000-0000-0000000000ef', true);
SELECT 'A reads table directly' t, count(*) FROM ai_personal_key_booking_grants;
-- B owns key b, NO meetings.view
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
SELECT 'B on own key w/o meetings' t, public.fn_ai_personal_key_set_booking('10000000-0000-0000-0000-00000000000b', true);
SELECT 'B list' t, public.fn_ai_personal_key_booking_ids();
-- A switches off
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
SELECT 'A off' t, public.fn_ai_personal_key_set_booking('10000000-0000-0000-0000-00000000000a', false);
SELECT 'A list after off' t, public.fn_ai_personal_key_booking_ids();
RESET ROLE;
SET ROLE anon;
SELECT 'anon set' t, public.fn_ai_personal_key_set_booking('10000000-0000-0000-0000-00000000000a', true);
RESET ROLE;
SELECT 'grant rows' t, key_id, active FROM ai_personal_key_booking_grants;
