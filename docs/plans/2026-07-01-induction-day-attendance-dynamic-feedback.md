# Induction: Day-wise Attendance + Dynamic Feedback Scopes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Let an induction coordinator mark attendance once per day (instead of once per session), and let them dynamically opt a whole induction into day-end and/or whole-program feedback in addition to the existing per-session feedback.

**Architecture:** Attendance gets a new RPC pair that fans a single day-level mark out into the existing `event_session_attendance` rows (no new table, no change to the 75%-completion rollup). Feedback gets two new tables (`event_day_feedback`, `event_program_feedback`) mirroring `event_session_feedback`'s exact shape, plus two boolean opt-in columns on `induction_programs` (`feedback_day_enabled`, `feedback_program_enabled`) that default `false` — every existing induction is unaffected until a coordinator turns a scope on. All new coordinator UI lives inside the already-self-contained `SessionsSection` component (it already owns session + feedback loading); the fresher-facing cards slot into `my-induction/page.tsx` next to the existing `SessionRatingCard`/`AdvocacyCard`.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres RPC + RLS), TypeScript, Shadcn UI, no test runner (per this repo's CLAUDE.md — verification is `mcp__ide__getDiagnostics` + `get_advisors` + manual browser walkthrough, not pytest-style unit tests).

**Note on verification steps below:** this repo has no wired-up unit/integration test runner (see CLAUDE.md). Every task's "verify" step therefore uses this project's real tools — `mcp__supabase__apply_migration`, `mcp__supabase__get_advisors`, `mcp__ide__getDiagnostics`, and an actual browser walkthrough as a real coordinator/fresher account — instead of a test framework.

---

## Task 1: Migration — day-level attendance RPCs

**Files:**
- Create: `supabase/migrations/20260730100000_induction_day_attendance.sql`

**Step 1: Write the migration**

```sql
-- ============================================================================
-- Fresher Induction — Day-level attendance (bulk mark, fans out to sessions)
-- File: 20260730100000_induction_day_attendance.sql | Date: 2026-07-30
-- Adds 2 DEFINER + anon-revoked RPCs alongside the existing per-session ones
-- (fn_induction_session_roster / fn_induction_mark_attendance, phase 2a):
--   fn_induction_day_roster          — learners eligible for ANY session on a
--                                      day, + whether their existing per-session
--                                      marks for that day are uniform
--                                      (prefillable) or mixed (left blank).
--   fn_induction_mark_day_attendance — bulk-writes the SAME status into EVERY
--                                      session that day applicable to the
--                                      learner's batch, then recomputes
--                                      completion. Attendance storage stays
--                                      session-scoped; this is a marking-UX
--                                      convenience, not a new data model.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_day_roster(p_event_id UUID, p_day_number INTEGER)
RETURNS TABLE (
  learner_id      UUID,
  name            TEXT,
  register_number TEXT,
  batch_label     TEXT,
  status          TEXT,     -- the uniform status across the day's sessions, or NULL
  is_mixed        BOOLEAN   -- true when the learner's sessions that day carry DIFFERENT statuses
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_roster: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_day_roster: not authorized';
  END IF;

  RETURN QUERY
  WITH day_sessions AS (
    SELECT s.id, s.batch_id FROM public.event_sessions s
    -- day_number is nullable (NULL = the "Unscheduled" bucket the UI shows as
    -- day 0) — IS NOT DISTINCT FROM matches NULL rows a plain `=` would silently drop.
    WHERE s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
  ),
  eligible AS (
    -- a learner is on the day roster if at least one of the day's sessions
    -- applies to their batch (combined batch_id IS NULL, or an exact match)
    SELECT DISTINCT e.learner_id
    FROM public.induction_enrollment e
    JOIN day_sessions ds ON ds.batch_id IS NULL OR ds.batch_id = e.batch_id
    WHERE e.event_id = p_event_id
  ),
  marks AS (
    SELECT a.learner_id,
           count(DISTINCT a.status) AS distinct_statuses,
           min(a.status) AS one_status
    FROM public.event_session_attendance a
    JOIN day_sessions ds ON ds.id = a.session_id
    GROUP BY a.learner_id
  )
  SELECT el.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         CASE WHEN m.distinct_statuses = 1 THEN m.one_status ELSE NULL END::text,
         COALESCE(m.distinct_statuses, 0) > 1
  FROM eligible el
  JOIN public.learners_profiles lp ON lp.id = el.learner_id
  JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = el.learner_id
  LEFT JOIN public.induction_batches b ON b.id = ie.batch_id
  LEFT JOIN marks m ON m.learner_id = el.learner_id
  ORDER BY 2;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_roster(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_mark_day_attendance(p_event_id UUID, p_day_number INTEGER, p_marks JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_day_attendance: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_mark_day_attendance: not authorized';
  END IF;

  WITH incoming AS (
    SELECT (m->>'learner_id')::uuid AS learner_id, (m->>'status') AS status
    FROM jsonb_array_elements(p_marks) m
  ),
  fanned AS (
    SELECT s.id AS session_id, i.learner_id, i.status
    FROM incoming i
    JOIN public.induction_enrollment ie ON ie.event_id = p_event_id AND ie.learner_id = i.learner_id
    JOIN public.event_sessions s
      ON s.event_id = p_event_id AND s.day_number IS NOT DISTINCT FROM p_day_number
     AND (s.batch_id IS NULL OR s.batch_id = ie.batch_id)
  )
  INSERT INTO public.event_session_attendance (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT session_id, learner_id, v_inst, status, auth.uid(), now() FROM fanned
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();

  PERFORM public.fn_induction_recompute_completion(p_event_id);
  RETURN jsonb_array_length(p_marks);
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_mark_day_attendance(UUID, INTEGER, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

**Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with name `induction_day_attendance` and the SQL above (never leave a placeholder — this is the real body per this repo's migration workflow).

**Step 3: Verify**

Run `mcp__supabase__get_advisors` with `type: 'security'` — confirm no new lint warnings (both functions should show as `SECURITY DEFINER` with `search_path` pinned and no anon EXECUTE grant).

Run a sanity `execute_sql` to confirm both functions exist with the right signature:
```sql
SELECT proname, pg_get_function_arguments(oid) FROM pg_proc
WHERE proname IN ('fn_induction_day_roster', 'fn_induction_mark_day_attendance');
```
Expected: 2 rows.

**Step 4: Commit**

```bash
git add supabase/migrations/20260730100000_induction_day_attendance.sql
git commit -m "feat(induction): add day-level attendance RPCs (fan out to sessions)"
```

---

## Task 2: Migration — day & program feedback tables, RPCs, and the two opt-in toggles

**Files:**
- Create: `supabase/migrations/20260730110000_induction_day_program_feedback.sql`

**Step 1: Write the migration**

```sql
-- ============================================================================
-- Fresher Induction — Day-level & whole-program feedback (dynamic scopes)
-- File: 20260730110000_induction_day_program_feedback.sql | Date: 2026-07-30
-- Adds 2 opt-in toggle columns on induction_programs + 2 new feedback tables
-- (mirroring event_session_feedback, phase 2b) + their DEFINER RPCs. Both
-- scopes default OFF — existing inductions are unaffected until a coordinator
-- opts in. Neither new scope feeds induction_completion.value_score_avg (that
-- stays session-feedback-only — the scorecard/loop already consume it as such).
-- ============================================================================

ALTER TABLE public.induction_programs
  ADD COLUMN IF NOT EXISTS feedback_day_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feedback_program_enabled BOOLEAN NOT NULL DEFAULT false;

-- ── event_day_feedback ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_day_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  day_number      INTEGER NOT NULL,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_day_feedback_event_day_learner_uniq UNIQUE (event_id, day_number, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_edf_event   ON public.event_day_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_edf_learner ON public.event_day_feedback(learner_id);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.event_day_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.event_day_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

ALTER TABLE public.event_day_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_day_feedback_admin ON public.event_day_feedback;
CREATE POLICY event_day_feedback_admin ON public.event_day_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ── event_program_feedback ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_program_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  learner_id      UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_program_feedback_event_learner_uniq UNIQUE (event_id, learner_id)
);
CREATE INDEX IF NOT EXISTS idx_epf_event   ON public.event_program_feedback(event_id);
CREATE INDEX IF NOT EXISTS idx_epf_learner ON public.event_program_feedback(learner_id);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.event_program_feedback;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.event_program_feedback
  FOR EACH ROW EXECUTE FUNCTION public.induction_touch_updated_at();

ALTER TABLE public.event_program_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_program_feedback_admin ON public.event_program_feedback;
CREATE POLICY event_program_feedback_admin ON public.event_program_feedback FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 1. submit day feedback — self, must be enrolled in the event.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_day_feedback(
  p_event_id UUID, p_day_number INTEGER, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID; v_inst UUID; v_fid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: rating must be 1-5'; END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_day_feedback: not an induction event'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.induction_enrollment ie
    WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner
  ) THEN
    RAISE EXCEPTION 'fn_induction_submit_day_feedback: not enrolled in this induction';
  END IF;

  INSERT INTO public.event_day_feedback (event_id, day_number, learner_id, institution_id, rating, comment)
  VALUES (p_event_id, p_day_number, v_learner, v_inst, p_rating, p_comment)
  ON CONFLICT (event_id, day_number, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING id INTO v_fid;

  RETURN v_fid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_day_feedback(UUID, INTEGER, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_day_feedback(UUID, INTEGER, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. coordinator per-day feedback summary.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_day_feedback_summary(p_event_id UUID)
RETURNS TABLE (day_number INTEGER, avg_rating NUMERIC, response_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_day_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.day_number, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.day_number;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_day_feedback_summary(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. the fresher's OWN prior day ratings (pre-fill).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_day_feedback(p_event_id UUID)
RETURNS TABLE (day_number INTEGER, rating INTEGER, comment TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_day_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.day_number, f.rating, f.comment
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id AND f.learner_id = v_learner;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_day_feedback(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_day_feedback(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. submit program (whole-induction) feedback — self, must be enrolled.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_submit_program_feedback(
  p_event_id UUID, p_rating INTEGER, p_comment TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID; v_inst UUID; v_fid UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not a learner'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: rating must be 1-5'; END IF;

  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_program_feedback: not an induction event'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.induction_enrollment ie
    WHERE ie.event_id = p_event_id AND ie.learner_id = v_learner
  ) THEN
    RAISE EXCEPTION 'fn_induction_submit_program_feedback: not enrolled in this induction';
  END IF;

  INSERT INTO public.event_program_feedback (event_id, learner_id, institution_id, rating, comment)
  VALUES (p_event_id, v_learner, v_inst, p_rating, p_comment)
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()
  RETURNING id INTO v_fid;

  RETURN v_fid;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_submit_program_feedback(UUID, INTEGER, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_submit_program_feedback(UUID, INTEGER, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. coordinator program-wide feedback summary (single row).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_program_feedback_summary(p_event_id UUID)
RETURNS TABLE (avg_rating NUMERIC, response_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_program_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))) THEN
    RAISE EXCEPTION 'fn_induction_program_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_program_feedback_summary(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_program_feedback_summary(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. the fresher's OWN prior program rating (pre-fill).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_my_program_feedback(p_event_id UUID)
RETURNS TABLE (rating INTEGER, comment TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_my_program_feedback: not authenticated'; END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT f.rating, f.comment
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id AND f.learner_id = v_learner;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_my_program_feedback(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_program_feedback(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. expose the two feedback-scope toggles on the fresher's enrollment read.
--    Changing a RETURNS TABLE column list requires DROP + recreate — CREATE OR
--    REPLACE cannot add/change output columns on an existing function.
--
--    IMPORTANT: this rebuild must start from the CURRENT live shape, not the
--    phase-3 original. Phase 4 (20260627220000_induction_phase4_referral_advocacy.sql)
--    already DROP+recreated this same function once to add `advocacy_score`
--    between value_score_avg and is_profile_complete. That column is read live
--    by my-induction/page.tsx (AdvocacyCard). Omitting it here would silently
--    regress the advocacy card on every fresher's page. The body below is the
--    phase-4 version verbatim, plus ONLY the two new trailing columns.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_induction_my_enrollments();

CREATE FUNCTION public.fn_induction_my_enrollments()
RETURNS TABLE (
  event_id               UUID,
  event_name             TEXT,
  institution_id         UUID,
  institution_name       TEXT,
  start_date             DATE,
  end_date               DATE,
  status                 TEXT,
  batch_id               UUID,
  batch_label            TEXT,
  sessions_total         INTEGER,
  sessions_attended      INTEGER,
  attendance_pct         NUMERIC,
  participation_complete BOOLEAN,
  value_score_avg        NUMERIC,
  advocacy_score         NUMERIC,
  is_profile_complete    BOOLEAN,
  profile_fields_total   INTEGER,
  profile_fields_filled  INTEGER,
  feedback_day_enabled     BOOLEAN,
  feedback_program_enabled BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_my_enrollments: not authenticated';
  END IF;
  v_learner := get_my_learner_id();
  IF v_learner IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id::uuid,
    e.name::text,
    e.institution_id::uuid,
    i.name::text,
    e.start_date::date,
    e.end_date::date,
    e.status::text,
    ie.batch_id::uuid,
    b.label::text,
    COALESCE(c.sessions_total, 0)::integer,
    COALESCE(c.sessions_attended, 0)::integer,
    COALESCE(c.attendance_pct, 0)::numeric,
    COALESCE(c.participation_complete, false)::boolean,
    c.value_score_avg::numeric,
    c.advocacy_score::numeric,
    COALESCE(lp.is_profile_complete, false)::boolean,
    4::integer,
    (
      (lp.college_email   IS NOT NULL AND btrim(lp.college_email) <> '')::int +
      (lp.academic_year_id IS NOT NULL)::int +
      (lp.semester_id      IS NOT NULL)::int +
      (lp.section_id       IS NOT NULL)::int
    )::integer,
    COALESCE(ip.feedback_day_enabled, false)::boolean,
    COALESCE(ip.feedback_program_enabled, false)::boolean
  FROM public.induction_enrollment ie
  JOIN public.events             e  ON e.id = ie.event_id
  JOIN public.institutions       i  ON i.id = e.institution_id
  LEFT JOIN public.induction_batches    b  ON b.id = ie.batch_id
  LEFT JOIN public.induction_completion c  ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
  LEFT JOIN public.learners_profiles    lp ON lp.id = ie.learner_id
  LEFT JOIN public.induction_programs   ip ON ip.event_id = ie.event_id
  WHERE ie.learner_id = v_learner
  ORDER BY e.start_date DESC NULLS LAST;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_induction_my_enrollments() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_my_enrollments() TO authenticated;

NOTIFY pgrst, 'reload schema';
```

**Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with name `induction_day_program_feedback` and the SQL above.

**Step 3: Verify**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'induction_programs' AND column_name LIKE 'feedback_%';
-- expect: feedback_day_enabled, feedback_program_enabled

SELECT proname FROM pg_proc WHERE proname IN (
  'fn_induction_submit_day_feedback','fn_induction_day_feedback_summary','fn_induction_my_day_feedback',
  'fn_induction_submit_program_feedback','fn_induction_program_feedback_summary','fn_induction_my_program_feedback',
  'fn_induction_my_enrollments'
);
-- expect: 7 rows

-- Confirm fn_induction_my_enrollments kept ALL prior columns (esp. advocacy_score,
-- added in phase 4) and gained exactly the 2 new ones — a 20-column function
-- (phase 4's shape was already 18 columns, not 17 — 18 + 2 = 20).
SELECT count(*) AS n_output_columns, bool_or(attname = 'advocacy_score') AS has_advocacy_score,
       bool_or(attname = 'feedback_day_enabled') AS has_day_flag,
       bool_or(attname = 'feedback_program_enabled') AS has_program_flag
FROM pg_attribute
WHERE attrelid = (SELECT prorettype FROM pg_proc WHERE proname = 'fn_induction_my_enrollments')
  AND attnum > 0 AND NOT attisdropped;
-- expect: n_output_columns = 20, all three bool_or columns = true
```

Run `mcp__supabase__get_advisors` with `type: 'security'` — confirm the 2 new tables show RLS enabled with no anon-writable warnings, and no new function lacks a `search_path`.

**Step 4: Commit**

```bash
git add supabase/migrations/20260730110000_induction_day_program_feedback.sql
git commit -m "feat(induction): add day/program feedback tables, RPCs, and opt-in toggles"
```

---

## Task 3: Register new tables in generated types + mirror both migrations into supabase/setup/

**Files:**
- Modify: `types/supabase.ts` (or regenerate)
- Modify: `supabase/setup/01_tables.sql`, `02_functions.sql`, `03_policies.sql`, `04_triggers.sql`

**Step 1:** Run `mcp__supabase__generate_typescript_types` and diff against `types/supabase.ts` — confirm `event_day_feedback`, `event_program_feedback`, and the 2 new `induction_programs` columns appear; apply the diff to `types/supabase.ts`.

**Step 2:** Append the two new tables (with their indexes, triggers, RLS policy) into `supabase/setup/01_tables.sql`, the 9 new/changed functions into `02_functions.sql` (replacing the old `fn_induction_my_enrollments` block there with the new 19-column version), the 2 new RLS policies into `03_policies.sql`, and the 2 new triggers into `04_triggers.sql` — per `supabase/MODULE_DEVELOPMENT_WORKFLOW.md`.

**Step 3: Verify**

`mcp__ide__getDiagnostics` on `types/supabase.ts` — expect no new errors.

**Step 4: Commit**

```bash
git add types/supabase.ts supabase/setup/01_tables.sql supabase/setup/02_functions.sql supabase/setup/03_policies.sql supabase/setup/04_triggers.sql
git commit -m "chore(induction): register day/program feedback schema in types + setup mirror"
```

---

## Task 4: Extend InductionService — types + methods

**Files:**
- Modify: `lib/services/induction/induction-service.ts`

**Step 1:** Add new interfaces near the existing `RosterRow`/`SessionFeedbackSummary` interfaces (around line 573-583):

```typescript
export interface DayRosterRow {
  learner_id: string;
  name: string;
  register_number: string | null;
  batch_label: string | null;
  status: AttendanceStatus | null;
  is_mixed: boolean;
}

export interface DayFeedbackSummary { day_number: number; avg_rating: number; response_count: number; }
export interface MyDayFeedback { day_number: number; rating: number; comment: string | null; }
export interface ProgramFeedbackSummary { avg_rating: number; response_count: number; }
export interface MyProgramFeedback { rating: number; comment: string | null; }
```

**Step 2:** Add methods inside the `InductionService` class, right after `markAttendance` (after line 255):

```typescript
  // ── Day-level attendance (bulk mark, fans out to sessions) ──────────────────

  /** Roster for a whole day — everyone eligible for any session that day, with
   *  a uniform status pre-filled or is_mixed=true when their sessions differ. */
  static async getDayRoster(eventId: string, dayNumber: number): Promise<DayRosterRow[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_day_roster', {
      p_event_id: eventId,
      p_day_number: dayNumber,
    });
    if (error) throw error;
    return (data as DayRosterRow[]) ?? [];
  }

  /** Bulk mark attendance for every session under one day; recomputes completion. */
  static async markDayAttendance(eventId: string, dayNumber: number, marks: AttendanceMark[]): Promise<number> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_mark_day_attendance', {
      p_event_id: eventId,
      p_day_number: dayNumber,
      p_marks: marks,
    });
    if (error) throw error;
    return (data as number) ?? 0;
  }
```

**Step 3:** Add methods right after `getFeedbackMethodMix` (after line 313):

```typescript
  // ── Day-level feedback (opt-in scope) ────────────────────────────────────────

  static async submitDayFeedback(eventId: string, dayNumber: number, rating: number, comment?: string | null): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_day_feedback', {
      p_event_id: eventId,
      p_day_number: dayNumber,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  static async getDayFeedbackSummary(eventId: string): Promise<DayFeedbackSummary[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_day_feedback_summary', { p_event_id: eventId });
    if (error) throw error;
    return (data as DayFeedbackSummary[]) ?? [];
  }

  static async myDayFeedback(eventId: string): Promise<MyDayFeedback[]> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_day_feedback', { p_event_id: eventId });
    if (error) throw error;
    return (data as MyDayFeedback[]) ?? [];
  }

  // ── Whole-program feedback (opt-in scope) ────────────────────────────────────

  static async submitProgramFeedback(eventId: string, rating: number, comment?: string | null): Promise<string> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_submit_program_feedback', {
      p_event_id: eventId,
      p_rating: rating,
      p_comment: comment ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  static async getProgramFeedbackSummary(eventId: string): Promise<ProgramFeedbackSummary | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_program_feedback_summary', { p_event_id: eventId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as ProgramFeedbackSummary) ?? null;
  }

  static async myProgramFeedback(eventId: string): Promise<MyProgramFeedback | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('fn_induction_my_program_feedback', { p_event_id: eventId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return (row as MyProgramFeedback) ?? null;
  }

  // ── Coordinator: which feedback scopes are on for this induction ────────────

  /** Read the two opt-in scope flags directly off induction_programs (RLS: induction_programs_view). */
  static async getFeedbackScopes(eventId: string): Promise<{ dayEnabled: boolean; programEnabled: boolean }> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('induction_programs')
      .select('feedback_day_enabled, feedback_program_enabled')
      .eq('event_id', eventId)
      .maybeSingle();
    if (error) throw error;
    return {
      dayEnabled: (data as any)?.feedback_day_enabled ?? false,
      programEnabled: (data as any)?.feedback_program_enabled ?? false,
    };
  }

  /** Flip the two scopes. Direct table write — induction_programs_manage RLS already
   *  gates this to induction.manage + institution access, same as coordinator writes
   *  elsewhere on this table (e.g. the detail page's own program reads). */
  static async setFeedbackScopes(eventId: string, dayEnabled: boolean, programEnabled: boolean): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('induction_programs')
      .update({ feedback_day_enabled: dayEnabled, feedback_program_enabled: programEnabled })
      .eq('event_id', eventId);
    if (error) throw error;
  }
```

**Step 4:** Add the 2 new fields to `MyInductionEnrollment` (around line 520-539), right after `profile_fields_filled: number;`:

```typescript
  feedback_day_enabled: boolean;
  feedback_program_enabled: boolean;
```

**Step 5: Verify**

`mcp__ide__getDiagnostics` on `lib/services/induction/induction-service.ts` — expect no errors.

**Step 6: Commit**

```bash
git add lib/services/induction/induction-service.ts
git commit -m "feat(induction): extend InductionService for day attendance + day/program feedback"
```

---

## Task 5: `DayAttendanceDialog` component (new)

**Files:**
- Create: `app/(routes)/events/induction/[id]/_components/day-attendance-dialog.tsx`

**Step 1: Write the component** (sibling of, and deliberately close in shape to, `attendance-dialog.tsx` — same P/A/E/OD button set, same save flow; the only new bit is the "varies by session" badge for `is_mixed` rows):

```tsx
'use client';

// Day-level attendance roster (bulk mark: one pass covers every session that
// day). Fans out into the SAME event_session_attendance rows the per-session
// AttendanceDialog writes — this is a marking-UX convenience, not a new data
// model. A learner whose sessions that day already carry DIFFERENT statuses
// shows "Varies by session" instead of a misleading pre-selected button, so a
// day-mark can't silently overwrite a deliberate partial-day mark.
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
  InductionService,
  type DayRosterRow,
  type AttendanceStatus,
  type AttendanceMark,
} from '@/lib/services/induction/induction-service';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { CalendarCheck } from 'lucide-react';

const OPTIONS: { value: AttendanceStatus; label: string; on: string }[] = [
  { value: 'present', label: 'P',  on: 'bg-green-600 text-white border-green-600' },
  { value: 'absent',  label: 'A',  on: 'bg-red-600 text-white border-red-600' },
  { value: 'excused', label: 'E',  on: 'bg-amber-500 text-white border-amber-500' },
  { value: 'od',      label: 'OD', on: 'bg-blue-600 text-white border-blue-600' },
];

export function DayAttendanceDialog({ eventId, dayNumber, dayLabel }: { eventId: string; dayNumber: number; dayLabel: string }) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<DayRosterRow[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await InductionService.getDayRoster(eventId, dayNumber);
      setRoster(r);
      const init: Record<string, AttendanceStatus> = {};
      for (const row of r) if (row.status) init[row.learner_id] = row.status;
      setMarks(init);
    } catch (e: any) {
      toast.error(`Couldn't load day roster: ${e.message ?? e}`);
    } finally { setLoading(false); }
  }, [eventId, dayNumber]);

  const onOpenChange = (o: boolean) => { setOpen(o); if (o) load(); };
  const set = (id: string, s: AttendanceStatus) => setMarks((m) => ({ ...m, [id]: s }));
  const allPresent = () => {
    const m: Record<string, AttendanceStatus> = {};
    for (const row of roster) m[row.learner_id] = 'present';
    setMarks(m);
  };

  const save = async () => {
    const payload: AttendanceMark[] = Object.entries(marks).map(([learner_id, status]) => ({ learner_id, status }));
    if (payload.length === 0) { toast.error('Mark at least one learner.'); return; }
    setSaving(true);
    try {
      const n = await InductionService.markDayAttendance(eventId, dayNumber, payload);
      toast.success(`Saved ${dayLabel} attendance for ${n} learner${n === 1 ? '' : 's'}.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(`Couldn't save day attendance: ${e.message ?? e}`);
    } finally { setSaving(false); }
  };

  const markedCount = Object.keys(marks).length;
  const presentCount = Object.values(marks).filter((s) => s === 'present' || s === 'od').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <CalendarCheck className="h-3.5 w-3.5" /> Mark day attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Attendance — {dayLabel}</DialogTitle>
          <DialogDescription>
            One mark applies to every session {dayLabel.toLowerCase()} for that learner. Present and OD count toward completion.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <span className="text-sm text-muted-foreground">
            {roster.length} enrolled · {markedCount} marked · {presentCount} present/OD
          </span>
          <Button size="sm" variant="outline" onClick={allPresent} disabled={loading || roster.length === 0}>
            Mark all present
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading roster…</p>
          ) : roster.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No freshers enrolled for this day&apos;s sessions yet.</p>
          ) : roster.map((row) => (
            <div key={row.learner_id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{row.name || 'Unnamed'}</div>
                <div className="text-xs text-muted-foreground">
                  {row.register_number ?? '—'}{row.batch_label ? ` · Batch ${row.batch_label}` : ''}
                  {row.is_mixed && <span className="ml-1.5 text-amber-600">· Varies by session</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {OPTIONS.map((o) => {
                  const selected = marks[row.learner_id] === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set(row.learner_id, o.value)}
                      className={`h-7 min-w-[32px] px-2 rounded border text-xs font-medium transition-colors ${
                        selected ? o.on : 'bg-background text-muted-foreground hover:bg-muted'
                      }`}
                      aria-pressed={selected}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || markedCount === 0}>
            {saving ? 'Saving…' : 'Save day attendance'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Verify**

`mcp__ide__getDiagnostics` on the new file — expect no errors.

**Step 3: Commit**

```bash
git add "app/(routes)/events/induction/[id]/_components/day-attendance-dialog.tsx"
git commit -m "feat(induction): add DayAttendanceDialog for bulk day-level marking"
```

---

## Task 6: Wire day attendance + feedback-scope settings + day/program stat badges into `sessions-section.tsx`

**Files:**
- Modify: `app/(routes)/events/induction/[id]/_components/sessions-section.tsx`

**Step 1:** Add imports (near the top, after the existing component imports around line 15-18):

```tsx
import { DayAttendanceDialog } from './day-attendance-dialog';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings2, Star as StarIcon } from 'lucide-react';
```
(`Star` is already imported for the per-session badge — keep both; `StarIcon` alias avoids a collision if you keep the existing `Star` import name. Simplest: just reuse the existing `Star` import for both badges, no alias needed — drop the `Star as StarIcon` line and use `Star` in both places.)

**Step 2:** Add state for the two new scopes and their summaries, right after the existing `feedback` state (line 49):

```tsx
  const [dayFeedback, setDayFeedback] = useState<Record<number, { avg: number; count: number }>>({});
  const [programFeedback, setProgramFeedback] = useState<{ avg: number; count: number } | null>(null);
  const [scopes, setScopes] = useState({ dayEnabled: false, programEnabled: false });
  const [scopesSaving, setScopesSaving] = useState(false);
```

**Step 3:** Extend `load()` (lines 78-91) to also fetch scopes + the two new summaries in the same `Promise.all`:

```tsx
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, summary, sc, daySummary, progSummary] = await Promise.all([
        InductionService.listSessions(eventId),
        InductionService.getSessionFeedbackSummary(eventId).catch(() => []),
        InductionService.getFeedbackScopes(eventId).catch(() => ({ dayEnabled: false, programEnabled: false })),
        InductionService.getDayFeedbackSummary(eventId).catch(() => []),
        InductionService.getProgramFeedbackSummary(eventId).catch(() => null),
      ]);
      setSessions(rows);
      const fb: Record<string, { avg: number; count: number }> = {};
      for (const s of summary) fb[s.session_id] = { avg: Number(s.avg_rating), count: s.response_count };
      setFeedback(fb);
      setScopes(sc);
      const df: Record<number, { avg: number; count: number }> = {};
      for (const d of daySummary) df[d.day_number] = { avg: Number(d.avg_rating), count: d.response_count };
      setDayFeedback(df);
      setProgramFeedback(progSummary ? { avg: Number(progSummary.avg_rating), count: progSummary.response_count } : null);
    } catch (e: any) { toast.error(`Couldn't load sessions: ${e.message ?? e}`); }
    finally { setLoading(false); }
  }, [eventId]);
```

**Step 4:** Add a handler to persist scope toggles, anywhere among the other handlers (e.g. right after `remove`, around line 194):

```tsx
  const toggleScope = async (key: 'dayEnabled' | 'programEnabled', value: boolean) => {
    const next = { ...scopes, [key]: value };
    setScopes(next);   // optimistic
    setScopesSaving(true);
    try {
      await InductionService.setFeedbackScopes(eventId, next.dayEnabled, next.programEnabled);
    } catch (e: any) {
      setScopes(scopes);   // revert on failure
      toast.error(`Couldn't update feedback settings: ${e.message ?? e}`);
    } finally { setScopesSaving(false); }
  };
```

**Step 5:** Add the settings popover to the `CardHeader`, right before the "Add session" `Dialog` (before line 220, inside the same `flex items-center justify-between gap-2` row):

```tsx
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="gap-1">
                  <Settings2 className="h-4 w-4" /> Feedback settings
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">Day-end feedback</div>
                    <div className="text-xs text-muted-foreground">One rating per fresher per day.</div>
                  </div>
                  <Switch checked={scopes.dayEnabled} disabled={scopesSaving}
                    onCheckedChange={(v) => toggleScope('dayEnabled', v)} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">
                    <div className="font-medium">Overall program feedback</div>
                    <div className="text-xs text-muted-foreground">One rating per fresher for the whole induction.</div>
                  </div>
                  <Switch checked={scopes.programEnabled} disabled={scopesSaving}
                    onCheckedChange={(v) => toggleScope('programEnabled', v)} />
                </div>
                {programFeedback && (
                  <div className="border-t pt-2 text-xs text-muted-foreground flex items-center gap-1">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    Overall: {programFeedback.avg.toFixed(1)} · {programFeedback.count} response{programFeedback.count === 1 ? '' : 's'}
                  </div>
                )}
              </PopoverContent>
            </Popover>
```

**Step 6:** Add the day-mark button + day feedback badge into the day-header band (replace the existing header block at lines 344-354):

```tsx
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 items-center rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary">
                      {d === 0 ? 'Unscheduled' : `Day ${d}`}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {daySessions.length} session{daySessions.length === 1 ? '' : 's'}
                    </span>
                    {scopes.dayEnabled && dayFeedback[d] && (
                      <Badge variant="outline" className="gap-1" title={`${dayFeedback[d].count} response(s)`}>
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {dayFeedback[d].avg.toFixed(1)} · {dayFeedback[d].count}
                      </Badge>
                    )}
                    <div className="h-px flex-1 bg-border" />
                    {d !== 0 && (
                      <DayAttendanceDialog eventId={eventId} dayNumber={d} dayLabel={`Day ${d}`} />
                    )}
                  </div>
```

**Step 7: Verify**

`mcp__ide__getDiagnostics` on `sessions-section.tsx` — expect no errors. Fix any prop/import mismatches (e.g. if `Popover`/`PopoverContent`/`PopoverTrigger` export names differ, check `components/ui/popover.tsx`).

**Step 8: Commit**

```bash
git add "app/(routes)/events/induction/[id]/_components/sessions-section.tsx"
git commit -m "feat(induction): wire day attendance button + feedback scope toggles into Sessions"
```

---

## Task 7: `DayFeedbackCard` and `ProgramFeedbackCard` components (new, fresher side)

**Files:**
- Create: `app/(routes)/learners/my-induction/_components/day-feedback-card.tsx`
- Create: `app/(routes)/learners/my-induction/_components/program-feedback-card.tsx`

**Step 1: `day-feedback-card.tsx`** (mirrors `session-rating-card.tsx`, scoped to a day instead of a session):

```tsx
'use client';

// Day-end value rating for the fresher (1–5 + optional comment) — only rendered
// when the induction's feedback_day_enabled scope is on. Mirrors SessionRatingCard;
// writes via InductionService.submitDayFeedback (upsert on event+day+learner).
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { InductionService } from '@/lib/services/induction/induction-service';
import { RatingScale } from './rating-scale';

const BRAND = '#0b6d41';

interface Props {
  eventId: string;
  dayNumber: number;
  initialRating?: number | null;
  initialComment?: string | null;
  onSubmitted?: (rating: number, comment: string | null) => void;
}

export function DayFeedbackCard({ eventId, dayNumber, initialRating, initialComment, onSubmitted }: Props) {
  const [rating, setRating] = useState<number | null>(initialRating ?? null);
  const [comment, setComment] = useState<string>(initialComment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [savedRating, setSavedRating] = useState<number | null>(initialRating ?? null);

  const dirty = rating !== savedRating || (comment ?? '') !== (initialComment ?? '');

  async function submit() {
    if (rating === null) { toast.error('Pick a rating from 1 to 5 first.'); return; }
    setSubmitting(true);
    try {
      const trimmed = comment.trim();
      await InductionService.submitDayFeedback(eventId, dayNumber, rating, trimmed === '' ? null : trimmed);
      setSavedRating(rating);
      toast.success('Thanks — your day rating was saved.');
      onSubmitted?.(rating, trimmed === '' ? null : trimmed);
    } catch (e: any) {
      toast.error(`Couldn't save your rating: ${e?.message ?? 'unknown error'}`);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="rounded-md border-2 border-dashed bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">
          How was today overall?
        </Label>
        {savedRating !== null && !dirty && (
          <span className="flex items-center gap-1 text-xs" style={{ color: BRAND }}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Rated {savedRating}/5
          </span>
        )}
      </div>

      <RatingScale value={rating} onChange={setRating} />

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Anything to add about today? (optional)"
        rows={2}
        className="resize-none text-sm"
      />

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={submit}
          disabled={submitting || rating === null || (!dirty && savedRating !== null)}
          style={{ backgroundColor: BRAND }}
          className="text-white hover:opacity-90"
        >
          {submitting ? 'Saving…' : savedRating !== null ? 'Update rating' : 'Submit rating'}
        </Button>
      </div>
    </div>
  );
}
```

**Step 2: `program-feedback-card.tsx`** (same pattern, whole-induction scope; visually a `Card` like `AdvocacyCard` since it lives in that section, not inline in the day list):

```tsx
'use client';

// Whole-program value rating for the fresher (1–5 + optional comment) — only
// rendered when feedback_program_enabled is on. Distinct from AdvocacyCard
// (which asks "would you recommend JKKN", 0–10 NPS) — this asks "how valuable
// was the induction overall". Writes via InductionService.submitProgramFeedback.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { InductionService } from '@/lib/services/induction/induction-service';
import { RatingScale } from './rating-scale';

const BRAND = '#0b6d41';

interface Props {
  eventId: string;
  initialRating?: number | null;
  initialComment?: string | null;
}

export function ProgramFeedbackCard({ eventId, initialRating, initialComment }: Props) {
  const [rating, setRating] = useState<number | null>(initialRating ?? null);
  const [comment, setComment] = useState<string>(initialComment ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [savedRating, setSavedRating] = useState<number | null>(initialRating ?? null);

  const dirty = rating !== savedRating || (comment ?? '') !== (initialComment ?? '');

  async function submit() {
    if (rating === null) { toast.error('Pick a rating from 1 to 5 first.'); return; }
    setSubmitting(true);
    try {
      const trimmed = comment.trim();
      await InductionService.submitProgramFeedback(eventId, rating, trimmed === '' ? null : trimmed);
      setSavedRating(rating);
      toast.success('Thanks — your overall rating was saved.');
    } catch (e: any) {
      toast.error(`Couldn't save your rating: ${e?.message ?? 'unknown error'}`);
    } finally { setSubmitting(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">How valuable was the induction overall?</CardTitle>
        <CardDescription>1 = not valuable, 5 = extremely valuable.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <RatingScale value={rating} onChange={setRating} />
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Anything to add? (optional)"
          rows={2}
          className="resize-none text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs">
            {savedRating !== null && !dirty ? (
              <span className="flex items-center gap-1" style={{ color: BRAND }}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Rated {savedRating}/5
              </span>
            ) : (
              <span className="text-muted-foreground">Pick a rating, then submit.</span>
            )}
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting || rating === null || (!dirty && savedRating !== null)}
            style={{ backgroundColor: BRAND }}
            className="text-white hover:opacity-90"
          >
            {submitting ? 'Saving…' : savedRating !== null ? 'Update' : 'Submit'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 3: Verify**

`mcp__ide__getDiagnostics` on both new files — expect no errors.

**Step 4: Commit**

```bash
git add "app/(routes)/learners/my-induction/_components/day-feedback-card.tsx" "app/(routes)/learners/my-induction/_components/program-feedback-card.tsx"
git commit -m "feat(induction): add DayFeedbackCard and ProgramFeedbackCard for opt-in scopes"
```

---

## Task 8: Wire day/program feedback cards into `my-induction/page.tsx`

**Files:**
- Modify: `app/(routes)/learners/my-induction/page.tsx`

**Step 1:** Add imports (near line 30-33):

```tsx
import { DayFeedbackCard } from './_components/day-feedback-card';
import { ProgramFeedbackCard } from './_components/program-feedback-card';
```

**Step 2:** Add state for the two new feedback maps, near the existing `feedback`/`referrals` state (line 54-55):

```tsx
  const [dayFeedback, setDayFeedback] = useState<Record<number, { rating: number; comment: string | null }>>({});
  const [programFeedback, setProgramFeedback] = useState<{ rating: number; comment: string | null } | null>(null);
```

**Step 3:** Extend the `load()` Promise.all (lines 66-70) to also fetch the two new feedback reads when the enabled scopes are on:

```tsx
        const [sess, fb, refs, dayFb, progFb] = await Promise.all([
          InductionService.listSessions(mine.event_id),
          InductionService.myFeedback(mine.event_id),
          InductionService.myReferrals(mine.event_id),
          mine.feedback_day_enabled ? InductionService.myDayFeedback(mine.event_id) : Promise.resolve([]),
          mine.feedback_program_enabled ? InductionService.myProgramFeedback(mine.event_id) : Promise.resolve(null),
        ]);
        setSessions(sess);
        const map: Record<string, { rating: number; comment: string | null }> = {};
        for (const f of fb) map[f.session_id] = { rating: f.rating, comment: f.comment };
        setFeedback(map);
        setReferrals(refs);
        const dmap: Record<number, { rating: number; comment: string | null }> = {};
        for (const d of dayFb) dmap[d.day_number] = { rating: d.rating, comment: d.comment };
        setDayFeedback(dmap);
        setProgramFeedback(progFb ? { rating: progFb.rating, comment: progFb.comment } : null);
```

(This replaces the existing 3-item `Promise.all` block and the two lines right after it — keep `setLoadingSessions(false);` as the block's last line, unchanged.)

**Step 4:** Render `DayFeedbackCard` once per day group, right after the `{daySessions.map((s) => ( ... ))}` closes (inside the `<div key={day} className="space-y-3">`, after line 254's closing and before that div's own closing at line 255):

```tsx
                    {enrollment.feedback_day_enabled && day > 0 && (
                      <DayFeedbackCard
                        eventId={enrollment.event_id}
                        dayNumber={day}
                        initialRating={dayFeedback[day]?.rating ?? null}
                        initialComment={dayFeedback[day]?.comment ?? null}
                        onSubmitted={(rating, comment) =>
                          setDayFeedback((prev) => ({ ...prev, [day]: { rating, comment } }))
                        }
                      />
                    )}
```

**Step 5:** Render `ProgramFeedbackCard` next to `AdvocacyCard` in the "Grow JKKN" section (around line 260-266):

```tsx
            <div className="space-y-4 pt-2">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Grow JKKN
              </h2>
              {enrollment.feedback_program_enabled && (
                <ProgramFeedbackCard
                  eventId={enrollment.event_id}
                  initialRating={programFeedback?.rating ?? null}
                  initialComment={programFeedback?.comment ?? null}
                />
              )}
              <AdvocacyCard eventId={enrollment.event_id} initialScore={enrollment.advocacy_score} />
              <ReferralSection eventId={enrollment.event_id} initialReferrals={referrals} />
            </div>
```

**Step 6: Verify**

`mcp__ide__getDiagnostics` on `my-induction/page.tsx` — expect no errors.

**Step 7: Commit**

```bash
git add "app/(routes)/learners/my-induction/page.tsx"
git commit -m "feat(induction): render day/program feedback cards on My Induction when opted in"
```

---

## Task 9: End-to-end verification

There is no test runner in this repo (CLAUDE.md) — this task is the real verification pass, not optional cleanup.

**Step 1:** Run `mcp__ide__getDiagnostics` across every touched/created file one more time as a final pass:
- `lib/services/induction/induction-service.ts`
- `app/(routes)/events/induction/[id]/_components/sessions-section.tsx`
- `app/(routes)/events/induction/[id]/_components/day-attendance-dialog.tsx`
- `app/(routes)/learners/my-induction/page.tsx`
- `app/(routes)/learners/my-induction/_components/day-feedback-card.tsx`
- `app/(routes)/learners/my-induction/_components/program-feedback-card.tsx`

**Step 2: Browser walkthrough as a coordinator** (an account with `induction.manage` on an institution with a live induction that has ≥2 sessions on the same day):
1. Open `/events/induction/[id]`. In the Sessions card, click "Mark day attendance" for a day with 2+ sessions. Confirm the roster loads once (not per-session).
2. Mark a few learners P/A/E/OD, save. Confirm the toast reports the right learner count, and re-opening each of that day's *individual* session `AttendanceDialog`s shows the same status carried into every session.
3. Mark one learner differently in a single session's `AttendanceDialog` afterward, then reopen "Mark day attendance" — confirm that learner now shows "Varies by session" instead of a stale pre-selected button.
4. Open "Feedback settings", flip on both switches. Confirm no error toast and the popover reflects the saved state on reopen.

**Step 3: Browser walkthrough as a fresher** (enrolled in that same induction):
1. Open `/learners/my-induction`. Confirm a "How was today overall?" card now appears once under each day's sessions, and a "How valuable was the induction overall?" card appears near the advocacy card.
2. Submit a day rating and an overall rating; refresh the page; confirm both pre-fill with "Rated X/5".
3. Back on the coordinator page, confirm the new day-badge and the popover's "Overall" line now show the submitted rating.

**Step 4:** If either module fails a check tied to routes/menus (unlikely here — no new routes or permission keys were added), run `npm run check:menus`; otherwise skip per CLAUDE.md guidance (no route/permission changes in this feature).

**Step 5: Final commit** (only if Step 1-3 surfaced small fixes):

```bash
git add -A
git commit -m "fix(induction): address issues found in end-to-end verification"
```
