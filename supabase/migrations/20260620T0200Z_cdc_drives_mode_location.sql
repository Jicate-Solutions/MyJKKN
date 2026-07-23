-- Migration: 2026-06-20 — CDC Drive Mode + off-campus live-location link
-- Bugs: BUG-004045 (Drive Mode: On-Campus / Off-Campus / Walk-in)
--       BUG-004096 (Off-Campus drives need a live-location link)
--
-- Adds two nullable columns to public.cdc_drives:
--   drive_mode    — first-class venue mode for the DRIVE (the event), values
--                   'on_campus' | 'off_campus' | 'walk_in'. Defaults to 'on_campus'.
--   location_url  — live-location / map link, used only when drive_mode = 'off_campus'
--                   (the form requires it in that case; DB keeps it nullable so other
--                    modes need not supply one).
--
-- RECONCILIATION NOTE (read before assuming a duplicate):
--   `is_walk_in` is a column on public.cdc_placements (the offer/result record), NOT on
--   public.cdc_drives. The drive's pre-existing "walk-in" concept is expressed by the
--   drive TYPE via cdc_drive_types.skip_states (a walk-in type skips intermediate lifecycle
--   states). This migration therefore does NOT add/sync an is_walk_in column on cdc_drives —
--   there is none to sync. drive_mode='walk_in' is the new first-class signal on the drive
--   itself; downstream placements created from such a drive may still set their own is_walk_in.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded CHECK creation (re-runnable).
-- DO NOT apply to production from this PR.

ALTER TABLE public.cdc_drives
  ADD COLUMN IF NOT EXISTS drive_mode   text NOT NULL DEFAULT 'on_campus';

ALTER TABLE public.cdc_drives
  ADD COLUMN IF NOT EXISTS location_url text;

-- Guarded CHECK: only the three allowed modes (added separately so re-runs don't error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cdc_drives_drive_mode_valid'
      AND conrelid = 'public.cdc_drives'::regclass
  ) THEN
    ALTER TABLE public.cdc_drives
      ADD CONSTRAINT cdc_drives_drive_mode_valid
      CHECK (drive_mode IN ('on_campus', 'off_campus', 'walk_in'));
  END IF;
END$$;

COMMENT ON COLUMN public.cdc_drives.drive_mode IS
  'Venue mode of the drive: on_campus | off_campus | walk_in. Added 2026-06-20 (BUG-004045).';
COMMENT ON COLUMN public.cdc_drives.location_url IS
  'Live-location / map link, used when drive_mode = off_campus. Added 2026-06-20 (BUG-004096).';
