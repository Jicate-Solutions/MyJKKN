-- ============================================================================
-- Migration: 20260521_add_board_type_to_bos_compositions_meetings.sql
-- Description: Add denormalized board_type column (e.g. 'PG', 'UG') to
--              bos_compositions and bos_meetings, sourced from COE
--              /api/public/boards.board_type at create-time.
--
-- Why denormalize?
--   The call-letter PDF renders "Meeting of the {board_type} {board_name}
--   Board of Studies" and is generated per-recipient inside a Puppeteer loop.
--   Hitting the COE API on every render would be an N+1 problem; storing
--   board_type on the meeting row avoids that.
--
-- Why two columns?
--   The call-letter render path SELECTs from bos_meetings directly (no
--   composition join). Having the column on bos_meetings keeps the existing
--   SELECT shape and lets the PDF route read board_type with no extra hop.
--   bos_compositions gets the same column so that meeting-create can copy it
--   forward without a COE round-trip on every meeting POST.
--
-- Backfill: NOT done here. bos_boards.board_type currently stores institution
-- category ("Arts & Science") not academic level ("PG"/"UG"), so a SQL backfill
-- from that column would be wrong. Use scripts/backfill-bos-board-type-from-coe.mjs
-- after applying this migration to hit the COE API and populate existing rows.
-- ============================================================================

ALTER TABLE bos_compositions
  ADD COLUMN IF NOT EXISTS board_type VARCHAR(50);

ALTER TABLE bos_meetings
  ADD COLUMN IF NOT EXISTS board_type VARCHAR(50);

COMMENT ON COLUMN bos_compositions.board_type IS
  'Academic level of the board (PG/UG/etc), denormalized from COE /api/public/boards.board_type at composition-create time';

COMMENT ON COLUMN bos_meetings.board_type IS
  'Academic level of the board (PG/UG/etc), copied from the parent composition at meeting-create time. Used to render "Meeting of the {board_type} {board_name} Board of Studies" in call-letter PDFs without a per-render COE round-trip.';
