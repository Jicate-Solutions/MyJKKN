-- Migration: 2026-04-24
-- Drop the temporary 2-arg compat shim added during PR #456 deployment window.
-- PR #456 is now merged — the new frontend uses get_seat_analytics(uuid) only.
DROP FUNCTION IF EXISTS public.get_seat_analytics(uuid, uuid);
