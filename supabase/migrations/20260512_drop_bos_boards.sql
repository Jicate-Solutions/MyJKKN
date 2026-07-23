-- Migration: 20260512_drop_bos_boards.sql
-- Boards are now fetched exclusively from the COE API (/api/v1/boards).
-- Drop FK constraints from dependent tables first, then drop the table.

-- bos_board_programmes.board_id → bos_boards(id)
ALTER TABLE IF EXISTS public.bos_board_programmes
  DROP CONSTRAINT IF EXISTS bos_board_programmes_board_id_fkey;

-- bos_programme_outcomes.board_id → bos_boards(id)
ALTER TABLE IF EXISTS public.bos_programme_outcomes
  DROP CONSTRAINT IF EXISTS bos_programme_outcomes_board_id_fkey;

-- bos_email_notifications.related_board_id → bos_boards(id)
ALTER TABLE IF EXISTS public.bos_email_notifications
  DROP CONSTRAINT IF EXISTS bos_email_notifications_related_board_id_fkey;

-- Drop the table (CASCADE catches any remaining dependent objects)
DROP TABLE IF EXISTS public.bos_boards CASCADE;
