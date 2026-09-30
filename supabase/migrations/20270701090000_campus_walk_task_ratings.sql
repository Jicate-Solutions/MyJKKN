-- 20270701090000_campus_walk_task_ratings.sql
--
-- InstaSolver / Campus Walk — "say thanks and give stars after a fix".
--
-- AUTHORITY
--   Director's rulings, 2026-09-30: after a fix the person who reported it can
--   give 1-5 stars and say thanks. The thank-you names the FIXER personally;
--   the reporter's own name is shown only if they choose to sign it (default
--   "Someone"). The public scoreboard stays DEPARTMENTS only (D9).
--
-- WHY A TABLE AND NOT project_tasks.metadata.ratings[]
--   Two writers already read-modify-write project_tasks.metadata with a
--   compare-and-set on status_key only (lib/campus-walk/closure.ts and
--   app/api/campus-walk/not-fixed/route.ts). A third writer appending to a
--   ratings[] array would race them and could silently drop a fix record or a
--   rating. A separate table also lets the DATABASE enforce "one rating per
--   reporter per fix round" with a UNIQUE index rather than application code.
--
-- WHAT A "FIX ROUND" IS
--   A job reopened with "Not fixed" and fixed again is a new round. The round
--   key is the fix photo (metadata.fix.attachment_id, falling back to
--   storage_path, submitted_at, then 'legacy') — the SAME key closure.ts uses
--   for the "your report was fixed" bell, computed by fixRoundKeyOf() in
--   lib/campus-walk/my-reports.ts.
--
-- WHO CAN SEE WHAT (RLS)
--   INSERT  the reporter, for a CLOSED campus-walk job they reported, as
--           themselves. The API route (app/api/instasolver/thanks/route.ts)
--           is the normal writer and re-checks all of this; the policy stops a
--           direct PostgREST insert from rating somebody else's job or a job
--           that is not closed.
--   SELECT  the reporter (their own rows); super admin / admin; and the FIXER
--           only for rows the reporter SIGNED. An unsigned row carries
--           reporter_profile_id, and RLS cannot hide one column, so letting the
--           fixer read unsigned rows would unmask "Someone". The fixer is told
--           about every rating through their bell, which never names an
--           unsigned reporter.
--   UPDATE / DELETE  nobody (no policy). A rating is a record, not a draft.
--
-- NO TRANSACTION CONTROL IN THIS FILE — the appliers wrap each file.
-- FILE ONLY — applied by the orchestrator at merge time, never from a lane.

CREATE TABLE IF NOT EXISTS public.campus_walk_task_ratings (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id              uuid        NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  -- The fix photo this rating is about. See fixRoundKeyOf().
  fix_round_key        text        NOT NULL CHECK (length(fix_round_key) BETWEEN 1 AND 300),
  reporter_profile_id  uuid        NOT NULL,
  -- The person who sent the fix photo for this round (or the Accountable for
  -- a job whose metadata was trimmed). NULL when nobody could be resolved.
  fixer_profile_id     uuid        NULL,
  stars                smallint    NOT NULL CHECK (stars BETWEEN 1 AND 5),
  thanks_text          text        NULL CHECK (thanks_text IS NULL OR length(thanks_text) <= 200),
  -- true = the reporter chose "Sign with my name". Default is anonymous.
  signed               boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.campus_walk_task_ratings IS
  'Stars (1-5) and an optional thank-you a reporter gives after a Campus Walk / InstaSolver job is fixed. One per reporter per fix round (UNIQUE task_id, fix_round_key, reporter_profile_id). Director ruling 2026-09-30.';

-- One rating per reporter per fix round — the database is the arbiter.
CREATE UNIQUE INDEX IF NOT EXISTS campus_walk_task_ratings_one_per_round
  ON public.campus_walk_task_ratings (task_id, fix_round_key, reporter_profile_id);

CREATE INDEX IF NOT EXISTS campus_walk_task_ratings_task_idx
  ON public.campus_walk_task_ratings (task_id);

CREATE INDEX IF NOT EXISTS campus_walk_task_ratings_fixer_idx
  ON public.campus_walk_task_ratings (fixer_profile_id)
  WHERE fixer_profile_id IS NOT NULL;

ALTER TABLE public.campus_walk_task_ratings ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges hand anon ALL on new tables. Nobody signed out
-- has any business here.
REVOKE ALL ON TABLE public.campus_walk_task_ratings FROM anon, PUBLIC;
GRANT SELECT, INSERT ON TABLE public.campus_walk_task_ratings TO authenticated;

DROP POLICY IF EXISTS campus_walk_task_ratings_insert_own ON public.campus_walk_task_ratings;
CREATE POLICY campus_walk_task_ratings_insert_own
  ON public.campus_walk_task_ratings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_profile_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
        FROM public.project_tasks t
       WHERE t.id = campus_walk_task_ratings.task_id
         AND t.metadata ->> 'source' = 'campus-walk'
         AND t.status_key = 'done'
         AND (
               t.metadata ->> 'reporter_id' = (SELECT auth.uid())::text
            OR t.metadata ->> 'raised_by_profile_id' = (SELECT auth.uid())::text
         )
    )
  );

DROP POLICY IF EXISTS campus_walk_task_ratings_select ON public.campus_walk_task_ratings;
CREATE POLICY campus_walk_task_ratings_select
  ON public.campus_walk_task_ratings
  FOR SELECT
  TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR reporter_profile_id = (SELECT auth.uid())
    OR (signed AND fixer_profile_id = (SELECT auth.uid()))
  );

-- Prove the outcome rather than assume it.
DO $$
DECLARE
  v_rls boolean;
  v_anon boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class
   WHERE oid = 'public.campus_walk_task_ratings'::regclass;
  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'campus_walk_task_ratings: row level security is not enabled';
  END IF;

  SELECT has_table_privilege('anon', 'public.campus_walk_task_ratings', 'SELECT')
      OR has_table_privilege('anon', 'public.campus_walk_task_ratings', 'INSERT')
    INTO v_anon;
  IF v_anon THEN
    RAISE EXCEPTION 'campus_walk_task_ratings: anon can still read or write the table';
  END IF;
END $$;
