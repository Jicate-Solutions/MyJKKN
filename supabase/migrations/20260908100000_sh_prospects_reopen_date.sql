-- 2026-08-15: schema-vs-code drift repair, second of the family.
-- sh_prospects.reopen_date has been referenced by code in FIVE files since the
-- Solutions Hub first shipped (prospects-service stats/stage/re-engage paths,
-- pipeline board, hooks, types) but was never created by any migration —
-- the same drift class as existing_client_id (fixed in 20260814125517).
-- Effect today: GET /api/solutions/prospects/stats hard-500s for every caller.
-- Nullable date: set when a dormant/lost prospect is given a re-engage date.

ALTER TABLE public.sh_prospects
  ADD COLUMN IF NOT EXISTS reopen_date date;

COMMENT ON COLUMN public.sh_prospects.reopen_date IS
  'When to re-engage a dormant/lost prospect. Null = no re-engagement scheduled.';

CREATE INDEX IF NOT EXISTS idx_sh_prospects_reopen
  ON public.sh_prospects(reopen_date) WHERE reopen_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';
