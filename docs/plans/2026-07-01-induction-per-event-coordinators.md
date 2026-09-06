# Induction: Per-Event Coordinators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Let each individual induction event have its own coordinator(s), independent of any other induction the same college runs, instead of one coordinator shared across every induction a college ever runs.

**Architecture:** A new `induction_event_coordinators` table + a new `fn_induction_is_event_coordinator(event_id)` helper, granting access ADDITIVELY alongside the existing institution-wide `induction_lead`/`induction_coordinator` roles — every one of the 25 existing privileged RPCs gets exactly one added `OR fn_induction_is_event_coordinator(...)` clause, nothing else in their bodies changes. Assignment UI moves from the shared `/events/induction` landing page into each induction's own detail page; the old landing-page panel is removed (the underlying institution-wide role/RPCs are untouched, so any coordinator already assigned that way keeps working).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres RPC + RLS), TypeScript, Shadcn UI, no test runner (verification is `mcp__ide__getDiagnostics` + `get_advisors` + live-DB checks + browser walkthrough).

**Note on the retrofit tasks (2-4):** every SQL body below was fetched LIVE from `pg_get_functiondef` against the actual production database on 2026-07-01 — not reconstructed from migration files, several of which are stale/superseded. Each function's ONLY change is the one line/clause marked `-- ADDED`. Do not alter anything else in these bodies, even if it looks improvable — these are already-tested, already-live functions.

---

## Task 1: Migration — the new per-event coordinator grant

**Files:**
- Create: `supabase/migrations/20260730120000_induction_event_coordinators.sql`

**Step 1: Write the migration**

```sql
-- ============================================================================
-- Fresher Induction — per-event coordinators (additive to institution-wide roles)
-- File: 20260730120000_induction_event_coordinators.sql | Date: 2026-07-30
-- A coordinator can now be assigned to ONE SPECIFIC induction event, independent
-- of the institution-wide induction_lead/induction_coordinator roles. This is
-- ADDITIVE: fn_induction_is_event_coordinator() is OR'd into every existing
-- privileged RPC's auth check in Tasks 2-4 below — nothing currently working
-- (institution-wide coordinators) loses access. Who can ASSIGN an event
-- coordinator stays identical to the existing college-wide gate (super-admin or
-- induction_lead only) — mirrors fn_induction_can_manage_coordinators exactly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.induction_event_coordinators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by   UUID REFERENCES public.profiles(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT induction_event_coordinators_event_user_uniq UNIQUE (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_iec_event ON public.induction_event_coordinators(event_id);
CREATE INDEX IF NOT EXISTS idx_iec_user  ON public.induction_event_coordinators(user_id);

ALTER TABLE public.induction_event_coordinators ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS induction_event_coordinators_admin ON public.induction_event_coordinators;
CREATE POLICY induction_event_coordinators_admin ON public.induction_event_coordinators FOR ALL
  USING (is_super_admin() OR is_admin()) WITH CHECK (is_super_admin() OR is_admin());

-- ----------------------------------------------------------------------------
-- 1. the additive grant check — OR'd into every existing privileged RPC below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_is_event_coordinator(p_event_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.induction_event_coordinators
    WHERE event_id = p_event_id AND user_id = p_user_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_is_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_is_event_coordinator(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. can the caller manage event-level coordinators? Identical gate to the
--    existing college-wide fn_induction_can_manage_coordinators (super-admin or
--    induction_lead only — a plain coordinator can't appoint others).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_can_manage_event_coordinators(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.fn_induction_can_manage_coordinators();
$$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_can_manage_event_coordinators(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_can_manage_event_coordinators(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. list coordinators assigned to ONE event.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_list_event_coordinators(p_event_id UUID)
RETURNS TABLE (user_id UUID, full_name TEXT, email TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_list_event_coordinators: not authorized';
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name::text, p.email::text
    FROM public.induction_event_coordinators iec
    JOIN public.profiles p ON p.id = iec.user_id
    WHERE iec.event_id = p_event_id
    ORDER BY p.full_name;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_list_event_coordinators(UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_list_event_coordinators(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. search assignable staff of THIS event's institution.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assignable_event_staff(p_event_id UUID, p_query TEXT DEFAULT NULL)
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, role TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_assignable_event_staff: not authorized';
  END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_event_staff: not an induction event'; END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, p.email, p.role
    FROM public.profiles p
    WHERE p.institution_id = v_inst
      AND COALESCE(p.role, '') <> 'student'
      AND p.learner_id IS NULL
      AND (
        p_query IS NULL OR p_query = ''
        OR p.full_name ILIKE '%' || p_query || '%'
        OR p.email ILIKE '%' || p_query || '%'
      )
    ORDER BY p.full_name
    LIMIT 25;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assignable_event_staff(UUID, TEXT) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assignable_event_staff(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. assign / remove (idempotent upsert + plain delete).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_induction_assign_event_coordinator(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst UUID;
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_assign_event_coordinator: not authorized';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'fn_induction_assign_event_coordinator: user_id required'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assign_event_coordinator: not an induction event'; END IF;
  -- defense-in-depth: the picker UI (fn_induction_assignable_event_staff) only ever
  -- offers staff of this event's own institution — reject a direct-API call that
  -- tries to appoint someone from a different college as this event's coordinator.
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_assign_event_coordinator: that user is not a member of this induction''s college';
  END IF;
  INSERT INTO public.induction_event_coordinators (event_id, user_id, assigned_by)
  VALUES (p_event_id, p_user_id, auth.uid())
  ON CONFLICT (event_id, user_id) DO NOTHING;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_assign_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_assign_event_coordinator(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_induction_remove_event_coordinator(p_event_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_induction_can_manage_event_coordinators(p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_remove_event_coordinator: not authorized';
  END IF;
  DELETE FROM public.induction_event_coordinators WHERE event_id = p_event_id AND user_id = p_user_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_induction_remove_event_coordinator(UUID, UUID) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_induction_remove_event_coordinator(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
```

**Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with name `induction_event_coordinators`.

**Step 3: Verify**

```sql
SELECT proname FROM pg_proc WHERE proname IN (
  'fn_induction_is_event_coordinator','fn_induction_can_manage_event_coordinators',
  'fn_induction_list_event_coordinators','fn_induction_assignable_event_staff',
  'fn_induction_assign_event_coordinator','fn_induction_remove_event_coordinator'
);
-- expect: 6 rows
SELECT relrowsecurity FROM pg_class WHERE relname = 'induction_event_coordinators';
-- expect: true
```

Run `mcp__supabase__get_advisors` with `type: 'security'` — confirm no new gaps.

**Step 4: Commit**

```bash
git add supabase/migrations/20260730120000_induction_event_coordinators.sql
git commit -m "feat(induction): add per-event coordinator grant (additive to institution-wide roles)"
```

---

## Task 2: Migration — retrofit the 6 session-scoped RPCs

**Files:**
- Create: `supabase/migrations/20260730130000_induction_coordinator_retrofit_sessions.sql`

Each function below already resolves the session's `event_id` into a local variable — add `OR public.fn_induction_is_event_coordinator(v_event)` to the existing auth check using that SAME variable. `fn_induction_delete_session` is the one exception: it doesn't currently have a `v_event` variable, so this task adds one (see its body below — the added `DECLARE` and the changed initial `SELECT`).

**Step 1: Write the migration** (every body below is the verbatim live definition with exactly one addition, marked `-- ADDED`):

```sql
-- ============================================================================
-- Fresher Induction — coordinator retrofit, part 1: 6 session-scoped RPCs
-- File: 20260730130000_induction_coordinator_retrofit_sessions.sql | Date: 2026-07-30
-- Adds `OR fn_induction_is_event_coordinator(event_id)` to each function's
-- existing auth check. Every body below is the CURRENT LIVE definition
-- (fetched via pg_get_functiondef, not reconstructed from migration files) with
-- exactly the one marked line added — nothing else changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_delete_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_event UUID;  -- ADDED: v_event
BEGIN
  SELECT s.event_id, ip.institution_id INTO v_event, v_inst  -- ADDED: s.event_id, v_event
  FROM public.event_sessions s
  JOIN public.induction_programs ip ON ip.event_id = s.event_id
  WHERE s.id = p_session_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_delete_session: session not found / not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_delete_session: not authorized';
  END IF;
  DELETE FROM public.event_sessions WHERE id = p_session_id;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_mark_attendance(p_session_id uuid, p_marks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_inst UUID; v_n INTEGER;
BEGIN
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_attendance: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_mark_attendance: not authorized';
  END IF;

  INSERT INTO public.event_session_attendance
    (session_id, learner_id, institution_id, status, marked_by, marked_at)
  SELECT p_session_id, (m->>'learner_id')::uuid, v_inst, (m->>'status'), auth.uid(), now()
  FROM jsonb_array_elements(p_marks) m
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    status = EXCLUDED.status, marked_by = EXCLUDED.marked_by, marked_at = now(), updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.fn_induction_recompute_completion(v_event);
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_roster(p_session_id uuid)
RETURNS TABLE(learner_id uuid, rating integer, comment text, capture_method text, is_self boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_inst UUID;
BEGIN
  SELECT s.event_id INTO v_event FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_session_feedback_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.learner_id::uuid, f.rating::int, f.comment::text,
         f.capture_method::text, (f.submitted_by IS NULL)::boolean
  FROM public.event_session_feedback f
  WHERE f.session_id = p_session_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_roster(p_session_id uuid)
RETURNS TABLE(learner_id uuid, name text, register_number text, batch_label text, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_batch UUID; v_inst UUID;
BEGIN
  SELECT s.event_id, s.batch_id INTO v_event, v_batch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_roster: not an induction session'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_session_roster: not authorized';
  END IF;

  RETURN QUERY
  SELECT e.learner_id::uuid,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         b.label::text,
         a.status::text
  FROM public.induction_enrollment e
  JOIN public.learners_profiles lp ON lp.id = e.learner_id
  LEFT JOIN public.induction_batches b ON b.id = e.batch_id
  LEFT JOIN public.event_session_attendance a ON a.session_id = p_session_id AND a.learner_id = e.learner_id
  WHERE e.event_id = v_event
    AND (v_batch IS NULL OR e.batch_id = v_batch)
  ORDER BY 2;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_set_session_speakers(p_session_id uuid, p_profile_ids uuid[], p_source_label text DEFAULT NULL::text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_count integer; v_event uuid;  -- ADDED: v_event
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authenticated';
  END IF;
  SELECT es.event_id, ip.institution_id INTO v_event, v_inst  -- ADDED: es.event_id, v_event
  FROM public.event_sessions es
  JOIN public.induction_programs ip ON ip.event_id = es.event_id
  WHERE es.id = p_session_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not an induction session';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_set_session_speakers: not authorized';
  END IF;

  DELETE FROM public.event_session_speakers WHERE session_id = p_session_id;

  INSERT INTO public.event_session_speakers (session_id, profile_id, source_label, created_by)
  SELECT p_session_id, pid, p_source_label, auth.uid()
  FROM unnest(COALESCE(p_profile_ids, ARRAY[]::uuid[])) AS pid
  -- only real users the caller can access: prevents linking a profile from an
  -- institution the coordinator has no access to (cross-tenant link injection).
  WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pid
                AND (is_super_admin() OR is_admin() OR role_has_institution_access(p.institution_id)))
  ON CONFLICT (session_id, profile_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_induction_submit_feedback_proxy(p_session_id uuid, p_marks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_event UUID; v_inst UUID; v_sbatch UUID; v_n INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not authenticated'; END IF;

  SELECT s.event_id, s.batch_id INTO v_event, v_sbatch FROM public.event_sessions s WHERE s.id = p_session_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: session not found'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = v_event;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not an induction session'; END IF;

  -- coordinator gate (identical to the attendance writer)
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(v_event)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_submit_feedback_proxy: not authorized';
  END IF;

  -- FILTER (don't abort): a row with an invalid rating / un-enrolled learner / wrong
  -- batch is silently skipped, so one stale pick on a SHARED device never loses the
  -- rest of the batch. DISTINCT ON dedupes a learner repeated in the payload (else
  -- ON CONFLICT "cannot affect row a second time" would abort the whole save). #1694 r3.
  WITH cleaned AS (
    SELECT (m->>'learner_id')::uuid AS learner_id,
           (m->>'rating')::int       AS rating,
           NULLIF(btrim(m->>'comment'), '') AS comment
    FROM jsonb_array_elements(p_marks) m
    WHERE (m->>'learner_id') IS NOT NULL
      AND (m->>'rating') IS NOT NULL
      AND (m->>'rating')::int BETWEEN 1 AND 5
  ),
  valid AS (
    SELECT DISTINCT ON (c.learner_id) c.learner_id, c.rating, c.comment
    FROM cleaned c
    WHERE EXISTS (   -- enrolled + (batch-specific session → only its batch)
      SELECT 1 FROM public.induction_enrollment ie
      WHERE ie.event_id = v_event AND ie.learner_id = c.learner_id
        AND (v_sbatch IS NULL OR ie.batch_id IS NOT DISTINCT FROM v_sbatch)
    )
    ORDER BY c.learner_id
  )
  -- ANTI-CLOBBER: the ON CONFLICT UPDATE only fires when the EXISTING submitted_by IS
  -- NOT NULL (a prior kiosk row). A fresher's own-login row (submitted_by IS NULL)
  -- makes the predicate false → Postgres silently skips it; a self-vote is never lost.
  INSERT INTO public.event_session_feedback
    (session_id, learner_id, event_id, institution_id, rating, comment, capture_method, submitted_by)
  SELECT p_session_id, v.learner_id, v_event, v_inst, v.rating, v.comment, 'volunteer_kiosk', auth.uid()
  FROM valid v
  ON CONFLICT (session_id, learner_id) DO UPDATE SET
    rating = EXCLUDED.rating, comment = EXCLUDED.comment,
    capture_method = 'volunteer_kiosk', submitted_by = EXCLUDED.submitted_by, updated_at = now()
  WHERE public.event_session_feedback.submitted_by IS NOT NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- refresh value_score_avg for each picked learner (idempotent; a skipped self-row
  -- recomputes to the same value, so this is safe for clobber-skipped rows too).
  INSERT INTO public.induction_completion (event_id, learner_id, institution_id, value_score_avg, updated_at)
  SELECT v_event, picked.learner_id, v_inst,
         (SELECT round(avg(f.rating), 2) FROM public.event_session_feedback f
            WHERE f.event_id = v_event AND f.learner_id = picked.learner_id), now()
  -- #1694 r6 (MEDIUM): refresh value_score_avg ONLY for learners that actually have a
  -- feedback row for this event. An enrolled-but-FILTERED pick (invalid rating / wrong
  -- batch, dropped from `valid`) with no feedback row would otherwise upsert
  -- value_score_avg = NULL (avg over an empty set) — polluting the leading metric and
  -- creating a spurious completion row. The feedback-row EXISTS re-aligns `picked` with `valid`.
  FROM (SELECT DISTINCT (m->>'learner_id')::uuid AS learner_id
        FROM jsonb_array_elements(p_marks) m
        WHERE EXISTS (SELECT 1 FROM public.induction_enrollment ie
                      WHERE ie.event_id = v_event AND ie.learner_id = (m->>'learner_id')::uuid)
          AND EXISTS (SELECT 1 FROM public.event_session_feedback f
                      WHERE f.event_id = v_event AND f.learner_id = (m->>'learner_id')::uuid)) picked
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    value_score_avg = EXCLUDED.value_score_avg, updated_at = now();

  RETURN v_n;
END $function$;

NOTIFY pgrst, 'reload schema';
```

**Step 2: Apply**, per Task 1's process, name `induction_coordinator_retrofit_sessions`.

**Step 3: Verify**

```sql
SELECT pg_get_functiondef(oid) ILIKE '%fn_induction_is_event_coordinator%' AS has_check, proname
FROM pg_proc WHERE proname IN (
  'fn_induction_delete_session','fn_induction_mark_attendance','fn_induction_session_feedback_roster',
  'fn_induction_session_roster','fn_induction_set_session_speakers','fn_induction_submit_feedback_proxy'
);
-- expect: has_check = true for all 6 rows
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260730130000_induction_coordinator_retrofit_sessions.sql
git commit -m "feat(induction): retrofit session-scoped RPCs with event-coordinator check"
```

---

## Task 3: Migration — retrofit event-scoped RPCs, batch 1 (10 functions)

**Files:**
- Create: `supabase/migrations/20260730140000_induction_coordinator_retrofit_event_batch1.sql`

All 10 already resolve `v_inst` directly from `p_event_id` (no session lookup needed) — the added clause is `OR public.fn_induction_is_event_coordinator(p_event_id)` (using the parameter directly, not a local variable, since none is needed here). **`fn_induction_auto_enroll` is the one exception** — it has TWO separate auth branches (multi-target vs. single-institution); the added clause goes into BOTH.

**Step 1: Write the migration** (bodies verbatim from live `pg_get_functiondef`, one addition each):

```sql
-- ============================================================================
-- Fresher Induction — coordinator retrofit, part 2: event-scoped RPCs (batch 1/2)
-- File: 20260730140000_induction_coordinator_retrofit_event_batch1.sql | Date: 2026-07-30
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_appoint_feedback_volunteer(p_event_id uuid, p_learner_id uuid, p_capacity integer DEFAULT 20)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_id UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: not authorized';
  END IF;
  IF p_learner_id IS NULL THEN RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: learner_id required'; END IF;
  -- guard: never appoint a fresher of THIS induction as a mentor.
  IF EXISTS (SELECT 1 FROM public.induction_enrollment ie
             WHERE ie.event_id = p_event_id AND ie.learner_id = p_learner_id) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is a fresher in this induction';
  END IF;
  -- guard: the learner must be a MEMBER of this college (a profile in v_inst).
  -- Don't trust the client-supplied id — mirror the assignable query's JOIN so an
  -- out-of-college learner can't be appointed and then read this college's roster PII
  -- via fn_induction_my_feedback_group. (Closes the cross-tenant gap; review #1694.)
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.learner_id = p_learner_id AND p.institution_id = v_inst) THEN
    RAISE EXCEPTION 'fn_induction_appoint_feedback_volunteer: that learner is not a member of this college';
  END IF;

  INSERT INTO public.induction_feedback_volunteers
    (event_id, learner_id, institution_id, capacity, is_active, appointed_by)
  VALUES (p_event_id, p_learner_id, v_inst, LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200), true, auth.uid())
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    is_active = true,
    capacity  = LEAST(GREATEST(COALESCE(p_capacity, 20), 1), 200),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_assignable_peer_mentors(p_event_id uuid, p_query text DEFAULT NULL::text)
RETURNS TABLE(learner_id uuid, full_name text, register_number text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_assignable_peer_mentors: not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT lp.id,   -- DISTINCT: a learner with >1 profile in the college appears once (review #1694)
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text
  FROM public.learners_profiles lp
  -- must have a login in THIS college (so they can actually use the mentor page)
  JOIN public.profiles p ON p.learner_id = lp.id AND p.institution_id = v_inst
  WHERE NOT EXISTS (  -- not a fresher being inducted here
          SELECT 1 FROM public.induction_enrollment ie
          WHERE ie.event_id = p_event_id AND ie.learner_id = lp.id)
    AND NOT EXISTS (  -- not already an active mentor on this event
          SELECT 1 FROM public.induction_feedback_volunteers v
          WHERE v.event_id = p_event_id AND v.learner_id = lp.id AND v.is_active)
    AND (
      p_query IS NULL OR p_query = ''
      OR btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,'')) ILIKE '%' || p_query || '%'
      OR lp.register_number ILIKE '%' || p_query || '%'
    )
  ORDER BY 2
  LIMIT 25;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_auto_enroll(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst uuid; v_year integer; v_scope text; v_degree_filter text;
  v_inst_ids uuid[]; v_degree_ids uuid[]; v_dept_ids uuid[];
  v_multi boolean; v_count integer;
BEGIN
  SELECT institution_id, admission_year, enroll_scope, degree_type_filter,
         target_institution_ids, target_degree_ids, target_department_ids
    INTO v_inst, v_year, v_scope, v_degree_filter, v_inst_ids, v_degree_ids, v_dept_ids
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction program not found for event %', p_event_id; END IF;
  v_multi := (v_inst_ids IS NOT NULL AND cardinality(v_inst_ids) > 0);

  IF v_multi THEN
    IF NOT (public._fn_induction_can_target_institutions(v_inst_ids)
            OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  ELSE
    IF NOT (is_super_admin() OR is_admin()
            OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
            OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
      RAISE EXCEPTION 'fn_induction_auto_enroll: not authorized'; END IF;
  END IF;
  IF v_year IS NULL THEN RAISE EXCEPTION 'fn_induction_auto_enroll: induction has no admission_year set'; END IF;

  INSERT INTO public.induction_enrollment (event_id, learner_id, institution_id, source)
  SELECT p_event_id, lp.id, lp.institution_id, 'auto_admission_year'
  FROM public.learners_profiles lp
  JOIN public.admission_years ay ON ay.id = lp.admission_year_id
  LEFT JOIN public.degrees d ON d.id = lp.degree_id
  WHERE ay.year = v_year
    AND lp.lifecycle_status IN ('reserved','admitted','account')
    AND (
      (v_multi AND lp.institution_id = ANY(v_inst_ids)
         AND (v_degree_ids IS NULL OR cardinality(v_degree_ids)=0 OR lp.degree_id = ANY(v_degree_ids))
         AND (v_dept_ids IS NULL OR cardinality(v_dept_ids)=0 OR lp.department_id = ANY(v_dept_ids)))
      OR
      (NOT v_multi AND (v_scope='group' OR lp.institution_id = v_inst)
         AND (v_degree_filter IS NULL OR d.degree_type = v_degree_filter))
    )
  ON CONFLICT (event_id, learner_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_auto_split_batches(p_event_id uuid, p_num_batches integer DEFAULT 2)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst      UUID;
  v_batch_ids UUID[];
  v_loads     BIGINT[];
  v_assigned  INTEGER := 0;
  v_min_idx   INTEGER;
  v_label     TEXT;
  i           INTEGER;
  dept        RECORD;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'fn_induction_auto_split_batches: induction program not found for event %', p_event_id;
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_auto_split_batches: not authorized';
  END IF;
  IF p_num_batches < 1 OR p_num_batches > 12 THEN
    RAISE EXCEPTION 'fn_induction_auto_split_batches: num_batches must be 1..12';
  END IF;

  FOR i IN 1..p_num_batches LOOP
    v_label := chr(64 + i);
    INSERT INTO public.induction_batches (event_id, institution_id, label, fill_rule)
    VALUES (p_event_id, v_inst, v_label, 'by_department')
    ON CONFLICT (event_id, label) DO NOTHING;
  END LOOP;

  SELECT array_agg(id ORDER BY label) INTO v_batch_ids
  FROM public.induction_batches WHERE event_id = p_event_id;
  v_loads := array_fill(0::bigint, ARRAY[array_length(v_batch_ids,1)]);

  FOR dept IN
    SELECT lp.department_id AS dept_id, count(*) AS n
    FROM public.induction_enrollment ie
    JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
    GROUP BY lp.department_id
    ORDER BY count(*) DESC
  LOOP
    v_min_idx := 1;
    FOR i IN 2..array_length(v_loads,1) LOOP
      IF v_loads[i] < v_loads[v_min_idx] THEN v_min_idx := i; END IF;
    END LOOP;

    UPDATE public.induction_enrollment ie
    SET batch_id = v_batch_ids[v_min_idx]
    FROM public.learners_profiles lp
    WHERE ie.learner_id = lp.id
      AND ie.event_id = p_event_id
      AND lp.department_id IS NOT DISTINCT FROM dept.dept_id;

    v_loads[v_min_idx] := v_loads[v_min_idx] + dept.n;
    v_assigned := v_assigned + dept.n;
  END LOOP;

  RETURN v_assigned;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_autobalance_feedback_volunteers(p_event_id uuid, p_capacity integer DEFAULT NULL::integer)
RETURNS TABLE(enrolled integer, assigned integer, unassigned integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_nvol INTEGER; v_enrolled INTEGER; v_assigned INTEGER;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: not authorized';
  END IF;

  SELECT count(*) INTO v_nvol
  FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND is_active;
  IF v_nvol = 0 THEN
    RAISE EXCEPTION 'fn_induction_autobalance_feedback_volunteers: no active feedback volunteers — appoint at least one first';
  END IF;

  -- full deterministic rebalance
  DELETE FROM public.induction_feedback_volunteer_group WHERE event_id = p_event_id;

  WITH active_vols AS (
    -- Effective per-mentor cap, clamped to [1,200] to bound slot generation: a direct
    -- RPC call with a huge p_capacity would otherwise materialize billions of slots →
    -- self-DoS (review #1694 r3 MEDIUM). p_capacity, WHEN PROVIDED, overrides per-run
    -- WITHOUT persisting (a per-mentor cap set elsewhere is never clobbered — r3 LOW);
    -- WHEN NULL, each mentor's own stored capacity drives balancing.
    SELECT id,
           LEAST(GREATEST(COALESCE(p_capacity, capacity), 1), 200) AS capacity,
           (row_number() OVER (ORDER BY created_at, id) - 1) AS vord
    FROM public.induction_feedback_volunteers
    WHERE event_id = p_event_id AND is_active
  ),
  -- each mentor contributes `capacity` slots; deal round-robin (round, then mentor
  -- order) so a mentor with capacity 1 takes exactly one fresher.
  ordered_slots AS (
    SELECT v.id AS volunteer_id,
           (row_number() OVER (ORDER BY gs.n, v.vord) - 1) AS slot_idx
    FROM active_vols v
    CROSS JOIN LATERAL generate_series(1, v.capacity) AS gs(n)
  ),
  ranked AS (
    SELECT ie.learner_id,
           (row_number() OVER (
              ORDER BY
                -- no-account FIRST (institution-scoped: a profile in ANOTHER college
                -- does NOT count as "has account" here — review #1694)
                (EXISTS (SELECT 1 FROM public.profiles p
                         WHERE p.learner_id = ie.learner_id AND p.institution_id = v_inst)),
                ie.batch_id NULLS FIRST,
                lp.first_name, lp.last_name, ie.learner_id
            ) - 1) AS rn
    FROM public.induction_enrollment ie
    JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
  ),
  assign AS (
    -- fresher rn → slot rn; freshers with rn >= total slots stay UNASSIGNED (surfaced below)
    SELECT r.learner_id, s.volunteer_id
    FROM ranked r
    JOIN ordered_slots s ON s.slot_idx = r.rn
  )
  INSERT INTO public.induction_feedback_volunteer_group (volunteer_id, event_id, learner_id)
  SELECT a.volunteer_id, p_event_id, a.learner_id FROM assign a
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    volunteer_id = EXCLUDED.volunteer_id, updated_at = now();
  GET DIAGNOSTICS v_assigned = ROW_COUNT;

  SELECT count(*) INTO v_enrolled
  FROM public.induction_enrollment WHERE event_id = p_event_id;

  -- Surface the coverage TRUTH: if capacity×mentors < enrolled, some freshers have NO
  -- owner. The UI warns when unassigned > 0 instead of implying full coverage
  -- (review #1694 HIGH: silent coverage gap).
  enrolled   := v_enrolled;
  assigned   := v_assigned;
  unassigned := v_enrolled - v_assigned;
  RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_day_feedback_summary(p_event_id uuid)
RETURNS TABLE(day_number integer, avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_day_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.day_number, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_day_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.day_number;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_day_roster(p_event_id uuid, p_day_number integer)
RETURNS TABLE(learner_id uuid, name text, register_number text, batch_label text, status text, is_mixed boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_day_roster: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
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
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_emit_naac_evidence(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prog    RECORD;
  v_period  TEXT;
  v_meta    JSONB;
  v_metric  TEXT;
  v_n       INTEGER := 0;
  v_rc      INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authenticated'; END IF;

  SELECT ip.id AS program_id, ip.institution_id, e.start_date, ay.academic_year_name
    INTO v_prog
  FROM public.induction_programs ip
  JOIN public.events e ON e.id = ip.event_id
  LEFT JOIN public.academic_years ay ON ay.id = ip.academic_year_id
  WHERE ip.event_id = p_event_id;
  IF v_prog.program_id IS NULL THEN RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not an induction event'; END IF;

  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_prog.institution_id))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_emit_naac_evidence: not authorized';
  END IF;

  -- Prefer the linked academic-year LABEL (correct AY semantics — an Indian academic
  -- year spans two calendar years, so a Jan–May induction must not be labelled by its
  -- calendar start year). Fall back to an IST-normalised calendar-year label only when
  -- the program has no academic_year row.
  v_period := COALESCE(
    NULLIF(btrim(v_prog.academic_year_name), ''),
    CASE WHEN v_prog.start_date IS NULL THEN NULL
      ELSE extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int::text || '-' ||
           right((extract(year FROM (v_prog.start_date AT TIME ZONE 'Asia/Kolkata'))::int + 1)::text, 2)
    END
  );

  -- Live rollup snapshot for the metadata (joins LIVE off the admission funnel).
  WITH freshers AS (
    SELECT ie.learner_id FROM public.induction_enrollment ie WHERE ie.event_id = p_event_id
  ),
  refs AS (  -- submitted/referrers = EFFORT (any JKKN college); only JOINED scoped to
             -- this college (match fn_induction_scorecard) for the NAAC evidence metadata.
    SELECT count(*) FILTER (WHERE al.id IS NOT NULL) AS submitted,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = v_prog.institution_id
           ) AS joined,
           count(DISTINCT al.referred_by_id) FILTER (WHERE al.id IS NOT NULL) AS referrers
    FROM freshers f
    LEFT JOIN public.admission_leads al
      ON al.referred_by_id = f.learner_id AND al.source = 'referral'::lead_source
  ),
  comp AS (
    SELECT count(*) AS enrolled,
           count(*) FILTER (WHERE c.participation_complete) AS participation_complete,
           count(*) FILTER (WHERE c.outcome_complete) AS outcome_complete,
           round(avg(c.attendance_pct), 2) AS avg_attendance_pct,
           round(avg(c.value_score_avg), 2) AS avg_value,
           round(avg(c.advocacy_score), 2) AS avg_advocacy
    FROM public.induction_enrollment ie
    LEFT JOIN public.induction_completion c
      ON c.event_id = ie.event_id AND c.learner_id = ie.learner_id
    WHERE ie.event_id = p_event_id
  )
  SELECT jsonb_build_object(
    'event_id', p_event_id,
    'period_label', v_period,
    'enrolled', comp.enrolled,
    'participation_complete', comp.participation_complete,
    'outcome_complete', comp.outcome_complete,
    'avg_attendance_pct', comp.avg_attendance_pct,
    'avg_value_score', comp.avg_value,
    'avg_advocacy_score', comp.avg_advocacy,
    'referrers', refs.referrers,
    'referrals_submitted', refs.submitted,
    'referrals_joined', refs.joined,
    'snapshot_at', now()
  ) INTO v_meta
  FROM comp, refs;

  -- Don't write NAAC evidence for an induction that reached nobody. The UI hides the
  -- button at enrolled=0, but a direct RPC must not emit all-zero evidence rows.
  IF COALESCE((v_meta->>'enrolled')::int, 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Upsert one evidence row per NAAC criterion (source row = the induction_programs
  -- satellite). Refresh metadata + mapped_at on conflict so re-running re-snapshots.
  FOREACH v_metric IN ARRAY ARRAY['5.1.3','7.2.1'] LOOP
    INSERT INTO public.quality_evidence_mappings
      (source_table, source_id, institution_id, body_code, metric_code,
       period_label, mapped_by, is_auto, metadata, mapped_at)
    VALUES
      ('induction_programs', v_prog.program_id, v_prog.institution_id, 'NAAC', v_metric,
       v_period, auth.uid(), true, v_meta, now())
    ON CONFLICT (source_table, source_id, body_code, metric_code) DO UPDATE
      SET period_label = EXCLUDED.period_label,
          metadata     = EXCLUDED.metadata,
          mapped_by    = EXCLUDED.mapped_by,
          is_auto      = true,
          mapped_at    = now()
      -- never clobber a manually-curated (is_auto=false) evidence mapping for this key
      WHERE public.quality_evidence_mappings.is_auto;
    -- count ACTUAL writes only: the upsert is a no-op (ROW_COUNT 0) when a manual
    -- row blocked the update, so the caller/UI never reports a false success.
    GET DIAGNOSTICS v_rc = ROW_COUNT;
    v_n := v_n + v_rc;
  END LOOP;

  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_feedback_method_mix(p_event_id uuid)
RETURNS TABLE(enrolled integer, responders integer, response_rate numeric, n_phone integer, n_volunteer_kiosk integer, no_account_enrolled integer, bias_flag boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst       UUID;
  v_enrolled   INTEGER;
  v_responders INTEGER;
  v_phone      INTEGER;
  v_kiosk      INTEGER;
  v_no_account INTEGER;
  v_rate       NUMERIC;
  v_dominant   NUMERIC;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_feedback_method_mix: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_feedback_method_mix: not authorized';
  END IF;

  SELECT count(*) INTO v_enrolled
  FROM public.induction_enrollment e WHERE e.event_id = p_event_id;

  -- enrolled freshers with no login account IN THIS COLLEGE — the structural exclusion
  -- ceiling for the own-phone path. Institution-scoped: a profile in ANOTHER college
  -- does not let them self-submit here, so it must not count as "has account"
  -- (review #1694: cross-tenant no_account misclassification).
  SELECT count(*) INTO v_no_account
  FROM public.induction_enrollment e
  WHERE e.event_id = p_event_id
    AND NOT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.learner_id = e.learner_id AND p.institution_id = v_inst);

  -- one row per distinct responder, attributed to phone if they EVER self-submitted.
  WITH per_learner AS (
    SELECT f.learner_id, bool_or(f.capture_method = 'phone') AS has_phone
    FROM public.event_session_feedback f
    WHERE f.event_id = p_event_id
      -- only still-enrolled learners (a since-unenrolled learner's old feedback must not
      -- push responders > enrolled / response_rate > 1.0 — review #1694 r4)
      AND EXISTS (SELECT 1 FROM public.induction_enrollment ie
                  WHERE ie.event_id = p_event_id AND ie.learner_id = f.learner_id)
    GROUP BY f.learner_id
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE has_phone)::int,
         count(*) FILTER (WHERE NOT has_phone)::int
  INTO v_responders, v_phone, v_kiosk
  FROM per_learner;

  v_rate := CASE WHEN v_enrolled = 0 THEN 0
                 ELSE round(v_responders::numeric / v_enrolled, 4) END;
  v_dominant := CASE WHEN v_responders = 0 THEN 0
                     ELSE round(greatest(v_phone, v_kiosk)::numeric / v_responders, 4) END;

  enrolled            := v_enrolled;
  responders          := v_responders;
  response_rate       := v_rate;
  n_phone             := v_phone;
  n_volunteer_kiosk   := v_kiosk;
  no_account_enrolled := v_no_account;
  bias_flag           := (v_rate < 0.5 OR v_dominant > 0.8);
  RETURN NEXT;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_list_feedback_volunteers(p_event_id uuid)
RETURNS TABLE(learner_id uuid, full_name text, register_number text, capacity integer, is_active boolean, group_size integer, captured integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_feedback_volunteers: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_list_feedback_volunteers: not authorized';
  END IF;

  RETURN QUERY
  SELECT v.learner_id,
         btrim(coalesce(lp.first_name,'') || ' ' || coalesce(lp.last_name,''))::text,
         lp.register_number::text,
         v.capacity,
         v.is_active,
         (SELECT count(*)::int FROM public.induction_feedback_volunteer_group g
            WHERE g.volunteer_id = v.id),
         (SELECT count(DISTINCT g.learner_id)::int
            FROM public.induction_feedback_volunteer_group g
            JOIN public.event_session_feedback f
              ON f.event_id = v.event_id AND f.learner_id = g.learner_id
            WHERE g.volunteer_id = v.id)
  FROM public.induction_feedback_volunteers v
  JOIN public.learners_profiles lp ON lp.id = v.learner_id
  WHERE v.event_id = p_event_id
  ORDER BY 2;
END $function$;

NOTIFY pgrst, 'reload schema';
```

**Step 2: Apply**, name `induction_coordinator_retrofit_event_batch1`.

**Step 3: Verify**

```sql
SELECT count(*) FROM pg_proc WHERE proname IN (
  'fn_induction_appoint_feedback_volunteer','fn_induction_assignable_peer_mentors','fn_induction_auto_enroll',
  'fn_induction_auto_split_batches','fn_induction_autobalance_feedback_volunteers','fn_induction_day_feedback_summary',
  'fn_induction_day_roster','fn_induction_emit_naac_evidence','fn_induction_feedback_method_mix',
  'fn_induction_list_feedback_volunteers'
) AND pg_get_functiondef(oid) ILIKE '%fn_induction_is_event_coordinator%';
-- expect: 10
```

**Step 4: Commit**

```bash
git add supabase/migrations/20260730140000_induction_coordinator_retrofit_event_batch1.sql
git commit -m "feat(induction): retrofit event-scoped RPCs batch 1 with event-coordinator check"
```

---

## Task 4: Migration — retrofit event-scoped RPCs, batch 2 (9 functions)

**Files:**
- Create: `supabase/migrations/20260730150000_induction_coordinator_retrofit_event_batch2.sql`

**Two functions here are structurally different from the others — read carefully before implementing:**
- **`fn_induction_list_sessions`** computes a `v_is_coordinator` BOOLEAN variable used for row-filtering (not a hard `RAISE`) — add the OR clause to that assignment, not a new `IF`.
- **`fn_induction_session_loop_summary`** similarly computes `v_is_coord` with no `RAISE` at all (unauthorized callers just get filtered rows) — same treatment.
- **`fn_induction_upsert_session`** has a SECOND, unrelated authorization check further down (`role_has_institution_access(v_res_inst)`, gating access to a *venue resource's* institution) — do **NOT** touch that one; only the FIRST check (`induction.manage` / `v_inst`) gets the event-coordinator OR clause.

**Step 1: Write the migration:**

```sql
-- ============================================================================
-- Fresher Induction — coordinator retrofit, part 3: event-scoped RPCs (batch 2/2)
-- File: 20260730150000_induction_coordinator_retrofit_event_batch2.sql | Date: 2026-07-30
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_induction_list_sessions(p_event_id uuid)
RETURNS TABLE(id uuid, day_number integer, session_order integer, batch_id uuid, batch_label text, start_at timestamp with time zone, end_at timestamp with time zone, title text, description text, venue_text text, venue_resource_id uuid, speaker_text text, outcome_text text, resource_links jsonb, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst UUID;
  v_is_coordinator BOOLEAN;
  v_my_learner UUID;
  v_my_batch UUID;
  v_enrolled BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_list_sessions: not an induction event'; END IF;

  v_is_coordinator := is_super_admin() OR is_admin()
    OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
    OR public.fn_induction_is_event_coordinator(p_event_id);  -- ADDED

  v_my_learner := get_my_learner_id();
  SELECT true, ie.batch_id INTO v_enrolled, v_my_batch
  FROM public.induction_enrollment ie
  WHERE ie.event_id = p_event_id AND ie.learner_id = v_my_learner;

  IF NOT v_is_coordinator AND NOT COALESCE(v_enrolled, false) THEN
    RAISE EXCEPTION 'fn_induction_list_sessions: not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id::uuid, s.day_number::integer, s.session_order::integer,
         s.batch_id::uuid, b.label::text,
         s.start_at, s.end_at,
         s.title::text, s.description::text, s.venue_text::text,
         s.venue_resource_id::uuid,
         s.speaker_text::text, s.outcome_text::text,
         COALESCE(s.resource_links, '[]'::jsonb), s.status::text
  FROM public.event_sessions s
  LEFT JOIN public.induction_batches b ON b.id = s.batch_id
  WHERE s.event_id = p_event_id
    AND (v_is_coordinator OR v_my_batch IS NULL OR s.batch_id IS NULL OR s.batch_id = v_my_batch)
  ORDER BY s.day_number NULLS LAST, s.start_at NULLS LAST, s.session_order;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_mark_day_attendance(p_event_id uuid, p_day_number integer, p_marks jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_mark_day_attendance: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
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
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_program_feedback_summary(p_event_id uuid)
RETURNS TABLE(avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_program_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_program_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_program_feedback f
  WHERE f.event_id = p_event_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_recompute_completion(p_event_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID; v_thr INTEGER; v_n INTEGER;
BEGIN
  SELECT institution_id, completion_attendance_pct INTO v_inst, v_thr
  FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_recompute_completion: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_recompute_completion: not authorized';
  END IF;

  WITH agg AS (
    SELECT e.learner_id, e.institution_id,
           count(s.id) AS total,
           count(a.id) FILTER (WHERE a.status IN ('present','od')) AS attended
    FROM public.induction_enrollment e
    LEFT JOIN public.event_sessions s
      ON s.event_id = e.event_id AND (s.batch_id IS NULL OR s.batch_id = e.batch_id)
    LEFT JOIN public.event_session_attendance a
      ON a.session_id = s.id AND a.learner_id = e.learner_id
    WHERE e.event_id = p_event_id
    GROUP BY e.learner_id, e.institution_id
  )
  INSERT INTO public.induction_completion
    (event_id, learner_id, institution_id, sessions_total, sessions_attended,
     attendance_pct, participation_complete, updated_at)
  SELECT p_event_id, agg.learner_id, agg.institution_id, agg.total, agg.attended,
         CASE WHEN agg.total = 0 THEN 0 ELSE round(100.0 * agg.attended / agg.total, 2) END,
         agg.total > 0 AND (CASE WHEN agg.total = 0 THEN 0 ELSE 100.0 * agg.attended / agg.total END) >= v_thr,
         now()
  FROM agg
  ON CONFLICT (event_id, learner_id) DO UPDATE SET
    sessions_total = EXCLUDED.sessions_total,
    sessions_attended = EXCLUDED.sessions_attended,
    attendance_pct = EXCLUDED.attendance_pct,
    participation_complete = EXCLUDED.participation_complete,
    updated_at = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_remove_feedback_volunteer(p_event_id uuid, p_learner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_remove_feedback_volunteer: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_remove_feedback_volunteer: not authorized';
  END IF;
  DELETE FROM public.induction_feedback_volunteers
  WHERE event_id = p_event_id AND learner_id = p_learner_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_scorecard(p_event_id uuid)
RETURNS TABLE(dimension text, group_id uuid, group_label text, enrolled integer, value_rated integer, value_avg numeric, advocacy_given integer, advocacy_avg numeric, promoters integer, referred integer, referrals_submitted bigint, referrals_joined bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_scorecard: not authenticated'; END IF;
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_scorecard: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_scorecard: not authorized';
  END IF;

  RETURN QUERY
  WITH freshers AS (
    SELECT ie.learner_id, lp.department_id, ie.batch_id
    FROM public.induction_enrollment ie
    LEFT JOIN public.learners_profiles lp ON lp.id = ie.learner_id
    WHERE ie.event_id = p_event_id
  ),
  refs AS (  -- per-fresher referral stats, LIVE. submitted/referred = EFFORT (a referral
             -- to any JKKN college counts — the "refer anywhere" decision); only JOINED is
             -- institution-scoped, since a join fills THIS college's seat.
    SELECT al.referred_by_id AS learner_id,
           count(*)::bigint AS submitted,
           count(*) FILTER (
             WHERE al.funnel_stage IN ('token_paid','confirmed','enrolled')
               AND al.institution_id = v_inst
           )::bigint AS joined
    FROM public.admission_leads al
    WHERE al.source = 'referral'::lead_source
      AND al.referred_by_id IN (SELECT learner_id FROM freshers)
    GROUP BY al.referred_by_id
  ),
  base AS (
    SELECT f.learner_id, f.department_id, f.batch_id,
           c.value_score_avg, c.advocacy_score,
           COALESCE(r.submitted, 0) AS submitted,
           COALESCE(r.joined, 0)    AS joined
    FROM freshers f
    LEFT JOIN public.induction_completion c
      ON c.event_id = p_event_id AND c.learner_id = f.learner_id
    LEFT JOIN refs r ON r.learner_id = f.learner_id
  )
  -- program total
  SELECT 'total'::text, NULL::uuid, 'All departments'::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  UNION ALL
  -- by department
  SELECT 'department'::text, b.department_id,
         COALESCE(d.department_name, '— Unassigned —')::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  LEFT JOIN public.departments d ON d.id = b.department_id
  GROUP BY b.department_id, d.department_name
  UNION ALL
  -- by batch
  SELECT 'batch'::text, b.batch_id,
         COALESCE(ib.label, '— No batch —')::text,
         count(*)::integer,
         count(*) FILTER (WHERE b.value_score_avg IS NOT NULL)::integer,
         round(avg(b.value_score_avg), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score IS NOT NULL)::integer,
         round(avg(b.advocacy_score), 2)::numeric,
         count(*) FILTER (WHERE b.advocacy_score >= 9)::integer,
         count(*) FILTER (WHERE b.submitted >= 1)::integer,
         COALESCE(sum(b.submitted), 0)::bigint,
         COALESCE(sum(b.joined), 0)::bigint
  FROM base b
  LEFT JOIN public.induction_batches ib ON ib.id = b.batch_id
  GROUP BY b.batch_id, ib.label
  ORDER BY 1, 3;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_feedback_summary(p_event_id uuid)
RETURNS TABLE(session_id uuid, avg_rating numeric, response_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst UUID;
BEGIN
  SELECT institution_id INTO v_inst FROM public.induction_programs WHERE event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_feedback_summary: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED
    RAISE EXCEPTION 'fn_induction_session_feedback_summary: not authorized';
  END IF;

  RETURN QUERY
  SELECT f.session_id::uuid, round(avg(f.rating), 2)::numeric, count(*)::integer
  FROM public.event_session_feedback f
  WHERE f.event_id = p_event_id
  GROUP BY f.session_id;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_session_loop_summary(p_event_id uuid)
RETURNS TABLE(topic_key text, first_session_id uuid, input_avg numeric, input_responses integer, suggestion jsonb, rerun_avg numeric, raw_lift numeric, rtm_expected_avg numeric, net_effect numeric, measure_status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid; v_is_coord boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fn_induction_session_loop_summary: not authenticated'; END IF;
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_session_loop_summary: not an induction event'; END IF;

  v_is_coord := is_super_admin() OR is_admin()
                OR (user_has_permission('induction.view') AND role_has_institution_access(v_inst))
                OR public.fn_induction_is_event_coordinator(p_event_id);  -- ADDED

  RETURN QUERY
  SELECT e.topic_key, e.first_session_id, e.input_avg, e.input_responses, e.suggestion,
         e.rerun_avg, e.raw_lift, e.rtm_expected_avg, e.net_effect, e.measure_status
  FROM public.induction_session_effectiveness e
  WHERE e.event_id = p_event_id
    AND (
      v_is_coord
      OR EXISTS (
        SELECT 1 FROM public.event_session_speakers sp
        WHERE sp.profile_id = auth.uid()
          AND sp.session_id IN (e.first_session_id, e.rerun_session_id)
      )
    )
  ORDER BY e.net_effect DESC NULLS LAST, e.input_avg ASC;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_induction_upsert_session(p_event_id uuid, p_session_id uuid, p_day_number integer, p_batch_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_title text, p_description text DEFAULT NULL::text, p_venue_text text DEFAULT NULL::text, p_speaker_text text DEFAULT NULL::text, p_outcome_text text DEFAULT NULL::text, p_resource_links jsonb DEFAULT '[]'::jsonb, p_session_order integer DEFAULT 1, p_venue_resource_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst          UUID;
  v_sid           UUID;
  v_existing_res  UUID;
  v_existing_text TEXT;
  v_venue_text    TEXT;
  v_res_name      TEXT;
  v_res_status    TEXT;
  v_res_inst      UUID;
  v_res_is_venue  BOOLEAN;
BEGIN
  SELECT ip.institution_id INTO v_inst FROM public.induction_programs ip WHERE ip.event_id = p_event_id;
  IF v_inst IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: not an induction event'; END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR (user_has_permission('induction.manage') AND role_has_institution_access(v_inst))
          OR public.fn_induction_is_event_coordinator(p_event_id)) THEN  -- ADDED (this check only — NOT the venue-institution check below)
    RAISE EXCEPTION 'fn_induction_upsert_session: not authorized';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'fn_induction_upsert_session: title required'; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: end must be after start';
  END IF;
  IF p_batch_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.induction_batches b WHERE b.id = p_batch_id AND b.event_id = p_event_id) THEN
    RAISE EXCEPTION 'fn_induction_upsert_session: batch does not belong to this induction';
  END IF;

  IF p_session_id IS NOT NULL THEN
    SELECT es.venue_resource_id, es.venue_text
      INTO v_existing_res, v_existing_text
    FROM public.event_sessions es
    WHERE es.id = p_session_id AND es.event_id = p_event_id;
  END IF;

  IF p_venue_resource_id IS NULL THEN
    v_venue_text := NULL;
  ELSIF p_session_id IS NOT NULL AND p_venue_resource_id IS NOT DISTINCT FROM v_existing_res THEN
    v_venue_text := v_existing_text;
  ELSE
    SELECT r.name,
           r.status,
           r.institution_id,
           EXISTS (
             SELECT 1 FROM public.resource_parent_categories pc
             WHERE pc.id = r.parent_category_id
               AND lower(btrim(pc.name)) = 'spaces & venues'
           )
      INTO v_res_name, v_res_status, v_res_inst, v_res_is_venue
    FROM public.resources r
    WHERE r.id = p_venue_resource_id;

    IF v_res_name IS NULL THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue resource not found';
    END IF;
    IF NOT v_res_is_venue THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: resource is not a Spaces & Venues room';
    END IF;
    IF v_res_status IS DISTINCT FROM 'available' THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: venue is not available';
    END IF;
    -- NOT touched: this gates whether the caller may use THIS VENUE (its own
    -- institution), an unrelated concern from "can this caller manage this induction."
    IF NOT (is_super_admin() OR is_admin() OR role_has_institution_access(v_res_inst)) THEN
      RAISE EXCEPTION 'fn_induction_upsert_session: no access to that venue''s institution';
    END IF;
    v_venue_text := v_res_name;
  END IF;

  IF p_session_id IS NULL THEN
    INSERT INTO public.event_sessions
      (event_id, title, description, start_at, end_at, day_number, session_order,
       venue_text, venue_resource_id, speaker_text, outcome_text, resource_links,
       batch_id, status, created_by)
    VALUES
      (p_event_id, btrim(p_title), p_description, p_start_at, p_end_at, p_day_number,
       COALESCE(p_session_order, 1), v_venue_text, p_venue_resource_id, p_speaker_text,
       p_outcome_text, COALESCE(p_resource_links, '[]'::jsonb), p_batch_id, 'scheduled', auth.uid())
    RETURNING id INTO v_sid;
  ELSE
    UPDATE public.event_sessions SET
      title = btrim(p_title), description = p_description,
      start_at = p_start_at, end_at = p_end_at, day_number = p_day_number,
      session_order = COALESCE(p_session_order, session_order),
      venue_text = v_venue_text, venue_resource_id = p_venue_resource_id,
      speaker_text = p_speaker_text, outcome_text = p_outcome_text,
      resource_links = COALESCE(p_resource_links, '[]'::jsonb),
      batch_id = p_batch_id, updated_at = now()
    WHERE id = p_session_id AND event_id = p_event_id
    RETURNING id INTO v_sid;
    IF v_sid IS NULL THEN RAISE EXCEPTION 'fn_induction_upsert_session: session not found for this induction'; END IF;
  END IF;
  RETURN v_sid;
END $function$;

NOTIFY pgrst, 'reload schema';
```

**Step 2: Apply**, name `induction_coordinator_retrofit_event_batch2`.

**Step 3: Verify**

```sql
SELECT count(*) FROM pg_proc WHERE proname IN (
  'fn_induction_list_sessions','fn_induction_mark_day_attendance','fn_induction_program_feedback_summary',
  'fn_induction_recompute_completion','fn_induction_remove_feedback_volunteer','fn_induction_scorecard',
  'fn_induction_session_feedback_summary','fn_induction_session_loop_summary','fn_induction_upsert_session'
) AND pg_get_functiondef(oid) ILIKE '%fn_induction_is_event_coordinator%';
-- expect: 9

-- Confirm fn_induction_upsert_session's SECOND (venue) check was NOT touched — should
-- appear exactly once with no fn_induction_is_event_coordinator nearby:
SELECT (pg_get_functiondef(oid) ~ 'role_has_institution_access\(v_res_inst\)') AS venue_check_intact
FROM pg_proc WHERE proname = 'fn_induction_upsert_session';
-- expect: true
```

Then run `mcp__supabase__get_advisors` with `type: 'security'` once more across all of Tasks 1-4 combined.

**Step 4: Commit**

```bash
git add supabase/migrations/20260730150000_induction_coordinator_retrofit_event_batch2.sql
git commit -m "feat(induction): retrofit event-scoped RPCs batch 2 with event-coordinator check"
```

---

## Task 5: Register new schema in types + setup mirror

**Files:**
- Modify: `types/supabase.ts`
- Modify: `supabase/setup/01_tables.sql`, `02_policies.sql` → actually `03_policies.sql`, `02_functions.sql`

Per the prior feature's established precedent: this module's existing 25 functions were **never mirrored** in `supabase/setup/` or registered in `types/supabase.ts` in the first place (confirmed pre-existing gap, out of scope to backfill). So this task only needs to add the **NEW** table + **NEW** 6 RPCs from Task 1 — Tasks 2-4 modify existing unregistered functions' bodies only, nothing new to mirror there.

**Step 1:** Run `mcp__supabase__generate_typescript_types`, diff against `types/supabase.ts`, apply ONLY the `induction_event_coordinators` table entry + the 6 new function signatures (`fn_induction_is_event_coordinator`, `fn_induction_can_manage_event_coordinators`, `fn_induction_list_event_coordinators`, `fn_induction_assignable_event_staff`, `fn_induction_assign_event_coordinator`, `fn_induction_remove_event_coordinator`) — alphabetically placed, matching the pattern from the prior feature's Task 3.

**Step 2:** Mirror into `supabase/setup/`:
- `01_tables.sql`: append `induction_event_coordinators` (table + 2 indexes + RLS enable, dated comment block).
- `02_functions.sql`: append the 6 new function bodies.
- `03_policies.sql`: append the `induction_event_coordinators_admin` policy.

**Step 3: Verify**

`mcp__ide__getDiagnostics` on `types/supabase.ts` — expect no new errors.

**Step 4: Commit**

```bash
git add types/supabase.ts supabase/setup/01_tables.sql supabase/setup/02_functions.sql supabase/setup/03_policies.sql
git commit -m "chore(induction): register per-event coordinator schema in types + setup mirror"
```

---

## Task 6: Extend InductionService

**Files:**
- Modify: `lib/services/induction/induction-service.ts`

**Step 1:** Add interface near `InductionCoordinator`/`AssignableStaff`:

```typescript
export interface EventCoordinator { user_id: string; full_name: string; email: string; }
```

**Step 2:** Add methods inside `InductionService`, near the existing `canManageCoordinators`/`listCoordinators`/`assignableStaff`/`assignCoordinator`/`removeCoordinator` block:

```typescript
  // ── Per-event coordinators (additive to institution-wide roles) ─────────────

  static async canManageEventCoordinators(eventId: string): Promise<boolean> {
    const { data, error } = await getSupabase().rpc('fn_induction_can_manage_event_coordinators', { p_event_id: eventId });
    if (error) return false;
    return !!data;
  }

  static async listEventCoordinators(eventId: string): Promise<EventCoordinator[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_list_event_coordinators', { p_event_id: eventId });
    if (error) throw error;
    return (data as EventCoordinator[]) ?? [];
  }

  static async assignableEventStaff(eventId: string, query: string): Promise<AssignableStaff[]> {
    const { data, error } = await getSupabase().rpc('fn_induction_assignable_event_staff', {
      p_event_id: eventId,
      p_query: query || null,
    });
    if (error) throw error;
    return (data as AssignableStaff[]) ?? [];
  }

  static async assignEventCoordinator(eventId: string, userId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_assign_event_coordinator', {
      p_event_id: eventId,
      p_user_id: userId,
    });
    if (error) throw error;
  }

  static async removeEventCoordinator(eventId: string, userId: string): Promise<void> {
    const { error } = await getSupabase().rpc('fn_induction_remove_event_coordinator', {
      p_event_id: eventId,
      p_user_id: userId,
    });
    if (error) throw error;
  }
```

**Step 3: Verify**

`mcp__ide__getDiagnostics` on the file — expect no errors.

**Step 4: Commit**

```bash
git add lib/services/induction/induction-service.ts
git commit -m "feat(induction): extend InductionService with per-event coordinator methods"
```

---

## Task 7: `EventCoordinatorsSection` component + wire into induction detail page

**Files:**
- Create: `app/(routes)/events/induction/[id]/_components/event-coordinators-section.tsx`
- Modify: `app/(routes)/events/induction/[id]/page.tsx`

**Step 1: Write the component** (mirrors `coordinators-panel.tsx`'s `AssignDialog` pattern, scoped to one event, hidden entirely for a viewer who can't manage):

```tsx
'use client';

// Per-event induction coordinators — lets the Induction Lead (or super-admin)
// appoint coordinators scoped to THIS SPECIFIC induction only, independent of
// any institution-wide coordinator. Additive: the institution-wide
// induction_lead/induction_coordinator roles keep working everywhere else —
// this is a second, narrower grant. Hidden entirely for anyone who can't manage.
import { useEffect, useState, useCallback } from 'react';
import {
  InductionService, type EventCoordinator, type AssignableStaff,
} from '@/lib/services/induction/induction-service';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { UserCog, UserPlus, X, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

export function EventCoordinatorsSection({ eventId }: { eventId: string }) {
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [coords, setCoords] = useState<EventCoordinator[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const can = await InductionService.canManageEventCoordinators(eventId);
    setCanManage(can);
    if (!can) { setLoading(false); return; }
    try {
      const c = await InductionService.listEventCoordinators(eventId);
      setCoords(c);
    } catch (e: any) {
      toast.error(`Couldn't load coordinators: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  if (canManage === false) return null;
  if (canManage === null || loading) return null;

  const remove = async (userId: string, name: string) => {
    try {
      await InductionService.removeEventCoordinator(eventId, userId);
      toast.success(`Removed ${name} as this induction's coordinator.`);
      load();
    } catch (e: any) {
      toast.error(`Couldn't remove: ${e.message ?? e}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary" /> Coordinators
        </CardTitle>
        <CardDescription>
          Appoint who runs THIS induction (sessions, attendance, feedback, batches). Independent of
          any institution-wide coordinator — visible to the Induction Lead and admins only.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {coords.length === 0 ? (
              <span className="text-xs text-muted-foreground">No coordinator assigned yet</span>
            ) : (
              coords.map((c) => (
                <Badge key={c.user_id} variant="secondary" className="gap-1 pr-1">
                  {c.full_name}
                  <button
                    type="button"
                    aria-label={`Remove ${c.full_name}`}
                    onClick={() => remove(c.user_id, c.full_name)}
                    className="ml-0.5 rounded hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
          <AssignEventDialog eventId={eventId} onAssigned={load} />
        </div>
      </CardContent>
    </Card>
  );
}

function AssignEventDialog({ eventId, onAssigned }: { eventId: string; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssignableStaff[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await InductionService.assignableEventStaff(eventId, query);
        if (active) setResults(r);
      } catch {
        /* surfaced on assign */
      } finally {
        if (active) setSearching(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, query, eventId]);

  const assign = async (s: AssignableStaff) => {
    setAssigning(s.id);
    try {
      await InductionService.assignEventCoordinator(eventId, s.id);
      toast.success(`${s.full_name} is now this induction's coordinator.`);
      setOpen(false);
      onAssigned();
    } catch (e: any) {
      toast.error(`Couldn't assign: ${e.message ?? e}`);
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><UserPlus className="h-3.5 w-3.5 mr-1" /> Assign</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign coordinator</DialogTitle>
          <DialogDescription>Pick a staff member to run this specific induction.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search by name or email…"
            value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        </div>
        <div className="max-h-72 overflow-auto space-y-1">
          {searching ? (
            <p className="text-sm text-muted-foreground py-2">Searching…</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No staff found.</p>
          ) : (
            results.map((s) => (
              <button key={s.id} type="button" onClick={() => assign(s)} disabled={!!assigning}
                className="w-full flex items-center justify-between gap-2 rounded-md border p-2 text-left hover:border-primary disabled:opacity-50">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.full_name}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.email} · {s.role}</div>
                </div>
                {assigning === s.id
                  ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  : <UserPlus className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2:** Wire into `app/(routes)/events/induction/[id]/page.tsx` — read the current file first (it hasn't been touched by this plan and last changed by the day-attendance/feedback feature, so re-read before editing). Add the import and render `<EventCoordinatorsSection eventId={id} />` right after the program header section (`</section>` that closes the "Program header — identity + at-a-glance meta" block), before the KPI strip.

**Step 3: Verify**

`mcp__ide__getDiagnostics` on both files.

**Step 4: Commit**

```bash
git add "app/(routes)/events/induction/[id]/_components/event-coordinators-section.tsx" "app/(routes)/events/induction/[id]/page.tsx"
git commit -m "feat(induction): add per-event Coordinators section to induction detail page"
```

---

## Task 8: Remove the old college-wide Coordinators panel

**Files:**
- Delete: `app/(routes)/events/induction/_components/coordinators-panel.tsx`
- Modify: `app/(routes)/events/induction/page.tsx`

Per the decision to remove the shared landing-page panel now that per-event assignment exists. The underlying institution-wide `induction_lead`/`induction_coordinator` roles and their RPCs (`fn_induction_can_manage_coordinators`, `fn_induction_list_coordinators`, `fn_induction_assignable_staff`, `fn_induction_assign_coordinator`, `fn_induction_remove_coordinator`) are **NOT** touched by this task — only this one UI entry point goes away. Anyone already holding the institution-wide role keeps it (grantable via the Role Management page if ever needed again).

**Step 1:** In `app/(routes)/events/induction/page.tsx`, remove the `import { CoordinatorsPanel } from './_components/coordinators-panel';` line and the `<CoordinatorsPanel />` render (with its preceding comment) from the JSX.

**Step 2:** Delete `app/(routes)/events/induction/_components/coordinators-panel.tsx` — confirm nothing else imports it first (`Grep` for `coordinators-panel` across the repo) before deleting.

**Step 3: Verify**

`mcp__ide__getDiagnostics` on `app/(routes)/events/induction/page.tsx` — expect no errors (no dangling import).

**Step 4: Commit**

```bash
git add "app/(routes)/events/induction/page.tsx"
git rm "app/(routes)/events/induction/_components/coordinators-panel.tsx"
git commit -m "refactor(induction): remove college-wide Coordinators panel (superseded by per-event section)"
```

---

## Task 9: End-to-end verification

No test runner in this repo — this is the real verification pass.

**Step 1:** `mcp__ide__getDiagnostics` final pass across all touched/created files:
- `lib/services/induction/induction-service.ts`
- `app/(routes)/events/induction/[id]/_components/event-coordinators-section.tsx`
- `app/(routes)/events/induction/[id]/page.tsx`
- `app/(routes)/events/induction/page.tsx`
- `types/supabase.ts`

**Step 2: Live-DB spot check** (controller can do this directly via `mcp__supabase__execute_sql`, wrapped in `BEGIN`/`ROLLBACK`, exactly as done during the day-attendance/feedback feature's debugging session): pick one real induction event and one real staff member NOT already an institution-wide coordinator; simulate `SET LOCAL role authenticated` + `request.jwt.claims` as that staff member; confirm `fn_induction_mark_attendance` (or another retrofitted RPC) RAISEs "not authorized" BEFORE being assigned as an event coordinator, then assign them via `fn_induction_assign_event_coordinator`, and confirm the SAME call now succeeds — proving the additive OR clause actually takes effect, not just that it doesn't break the institution-wide path.

**Step 3: Browser walkthrough** (coordinator flow):
1. Open an induction's detail page as an Induction Lead / super-admin. Confirm a new "Coordinators" section appears (separate from the old landing-page panel, which should no longer exist at all on `/events/induction`).
2. Assign a staff member who has NO institution-wide induction role. Confirm success.
3. Log in as (or impersonate) that staff member. Confirm they can now open sessions, mark attendance, view feedback summaries — for THIS induction only. If the college has a second induction, confirm they CANNOT manage that one.
4. Remove the coordinator; confirm they lose access to the first induction again.

**Step 4: Final commit** (only if Steps 1-3 surfaced fixes):

```bash
git add -A
git commit -m "fix(induction): address issues found in per-event coordinator verification"
```
