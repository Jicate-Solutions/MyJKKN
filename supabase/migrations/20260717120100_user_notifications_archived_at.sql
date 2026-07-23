-- Updated: 2026-07-17 - Add per-user archive support to user_notifications.
-- Consumed by app/api/notifications/[id]/route.ts: PATCH { action: 'archive' }
-- and the is_archived flag on regular PATCH persist a per-user archived state.
-- Archive is inherently per-user, so it belongs on the delivery row, NOT on the
-- shared `notifications` table (which has no archived_at column - the previous
-- service path wrote a phantom column). Additive + nullable; existing RLS on
-- user_notifications already scopes each row to its owner, so no policy change
-- is required. File under supabase/setup/01_tables.sql per SQL_FILE_INDEX.
ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- NOTE for main thread: regenerate types/supabase.ts (or hand-add archived_at to
-- the user_notifications Row/Insert/Update) so the two `as any` casts in the
-- route can later be removed. Follow-up (NOT in this route's scope, different
-- file): notification-service.ts getNotifications() hardcodes is_archived:false
-- and does not filter archived rows out of the inbox list, so archived items
-- persist but still render in the list until that mapper/filter is updated.