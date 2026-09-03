-- Campus Walk — where a daily step reading lands (D12).
-- Spec: specs/campus-walk-2026-08-17.md, D12 and §5.
--
-- ── WHAT D12 ASKS FOR ───────────────────────────────────────────────────────
-- "Steps + area coverage recorded, shown against the 20,000-step goal." Area
-- coverage needs nothing new — it is derived from the geo/category/institution
-- already on each observation's metadata. Steps have nowhere to land at all,
-- which is what this table fixes.
--
-- ── READ THIS BEFORE ASSUMING THE FEATURE WORKS ─────────────────────────────
-- This is an INGESTION SURFACE, not a pipeline. As of 2026-09-03 NOTHING sends
-- step readings to MyJKKN, and applying this migration does not change that.
-- The table will be empty, and /campus-walk/scoreboard/coverage says so in
-- plain words rather than drawing an empty chart.
--
-- The reason is architectural and is not solved here. Every step reading that
-- has ever existed was written by a sync job on the Director's own machine,
-- into a local Obsidian vault. MyJKKN is a deployed web application: it cannot
-- read that machine, that vault, or the wearable's API. Something has to POST
-- into app/api/campus-walk/scoreboard/steps for a number to appear. That
-- sender does not exist yet and building it is not in this change.
--
-- ── AND THE GAP IN THE DATA IS NOT A BROKEN JOB ─────────────────────────────
-- Verified 2026-09-03: the sync job that has historically produced these
-- readings is alive. It ran that morning, its API token is valid, and it
-- cached fresh responses for 2026-09-01/02/03. Its own log line for that run
-- is "0 written, 3 days with no ring data"; an August backfill logged "163
-- written, 99 days with no ring data". There has been no reading since
-- 2026-04-18 because the wearable stopped producing them — not because
-- software failed. Anything built on this table must preserve that
-- distinction: "no reading was taken" and "the feed is down" send different
-- people to fix different things, and only the first one is true.
--
-- ── PERSONAL HEALTH DATA STAYS OUT OF THIS REPOSITORY ───────────────────────
-- Spec §5 is explicit. This table holds a date and a step count and nothing
-- else. Body measurements, lab values, heart rate, sleep, calorie targets and
-- diet plans live in the Director's private vault and must never be added
-- here, however convenient the join looks later. A step count is operational
-- walk data — it says the campus was walked. Everything else is medical.
--
-- Version 20261103020000 sits above the highest version on jicate/main
-- (20261102030000, this module's own reporters policy) and is clear of the
-- versions claimed by the other lanes open at the same time (checked
-- 2026-09-03: 20261103000000 and 20261103010000 are both taken).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campus_walk_step_days (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Whose walk. Kept explicit rather than assumed-singular: D2 currently
  -- permits exactly one reporter, but that is a configuration row
  -- (campus_walk.reporters.allowed_emails) an admin can change without a
  -- deploy, and a schema that assumed one person would have to be migrated
  -- the day it changes.
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- The day being reported, in the reporter's local calendar. A DATE and not a
  -- timestamptz on purpose: "how many steps on the 3rd" is a calendar
  -- question, and storing an instant would make the answer depend on the
  -- reader's timezone.
  step_date    date NOT NULL,

  -- NOT NULL and >= 0. A day with no reading is an ABSENT ROW, never a row
  -- holding zero — that is the single most important rule about this table.
  -- Zero is a claim that somebody walked nowhere; absent is a claim that
  -- nobody measured. Storing zero for "unknown" would misreport the
  -- Director's activity, which is exactly what D12 exists to prevent.
  steps        integer NOT NULL CHECK (steps >= 0),

  -- Where the number came from, so a hand-typed correction is never mistaken
  -- for a device reading. Free text rather than an enum: the sender does not
  -- exist yet (see the header) and pinning a vocabulary now would be guessing
  -- at it. Non-blank is enforced so "unknown provenance" has one spelling.
  source       text NOT NULL DEFAULT 'manual'
                 CHECK (length(trim(source)) > 0),

  recorded_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- One reading per person per day. Re-sending a day corrects it (the route
  -- upserts on this constraint) rather than stacking duplicates that would
  -- silently double a total.
  CONSTRAINT campus_walk_step_days_profile_date_key UNIQUE (profile_id, step_date)
);

COMMENT ON TABLE public.campus_walk_step_days IS
  'Campus Walk D12 — one step reading per person per calendar day. A day with no reading has NO ROW; it is never stored as zero. Nothing feeds this table as of 2026-09-03 (see the migration header): it is the ingestion surface, not a pipeline.';

COMMENT ON COLUMN public.campus_walk_step_days.steps IS
  'Steps for that calendar day. Absent row means no reading was taken, which is not the same as zero steps walked.';

-- Reads are "the last N days, newest first, for one person".
CREATE INDEX IF NOT EXISTS campus_walk_step_days_profile_date_idx
  ON public.campus_walk_step_days (profile_id, step_date DESC);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
-- LOCKED TO service_role. RLS on with deliberately NO policies, plus an
-- explicit REVOKE — a role with no matching policy is refused, and the REVOKE
-- means that stays true even if somebody adds a permissive policy later.
--
-- Two reasons this is not opened to `authenticated`:
--
--   1. It is one named person's daily activity. There is no institutional
--      reason for any other signed-in account to read it, and the platform
--      default (Supabase GRANTs ALL ON TABLES to anon and authenticated) would
--      otherwise hand it to everybody with the browser's anon key.
--
--   2. The app-level gate is already the real boundary and is the same one the
--      rest of this module uses — lib/campus-walk/reporters.ts, resolved from
--      the platform_policies row seeded in 20261102030000, failing CLOSED to
--      the Director alone. Both the coverage page and the ingestion route hold
--      the service-role client behind that gate, exactly as
--      app/(routes)/campus-walk/review/page.tsx already does and for the same
--      documented reason: the service client is used to NARROW access, not to
--      widen it.
ALTER TABLE public.campus_walk_step_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.campus_walk_step_days FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
-- An upsert that corrects a day must move updated_at, so "when did this number
-- last change" is answerable without an audit table. recorded_at keeps the
-- first arrival.
CREATE OR REPLACE FUNCTION public.fn_campus_walk_step_days_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_campus_walk_step_days_touch() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_campus_walk_step_days_touch ON public.campus_walk_step_days;
CREATE TRIGGER trg_campus_walk_step_days_touch
  BEFORE UPDATE ON public.campus_walk_step_days
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_campus_walk_step_days_touch();
