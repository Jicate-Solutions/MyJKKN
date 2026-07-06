-- =====================================================================
-- SCF learner notes — APPROVAL QUEUE (drafts → super-admin review → learner)
-- Migration: 2026-07-03 — status column + gated reads + 2 review RPCs
-- =====================================================================
-- Until now the scf-learner-notes cron wrote AI-drafted support notes that a
-- struggling learner could see IMMEDIATELY (fn_scf_my_struggling_note). After
-- this migration every NEW note is a DRAFT that a super admin must approve
-- (per-note or bulk) before the learner ever sees it.
--
-- Flow change:
--   cron (service role) writes status='draft'
--     → super admin reviews at /admin/learner-notes
--       (fn_scf_learner_notes_pending lists drafts, full text — the review is
--        real; the reviewing super admin necessarily reads the draft wording)
--     → fn_scf_learner_notes_review(p_ids, 'approve'|'reject') bulk-updates
--     → ONLY status='approved' rows are visible to the learner
--       (fn_scf_my_struggling_note) and counted for leadership
--       (fn_scf_struggling_notes_sent — "sent" now means learner-visible).
--
-- DEFAULT 'approved' is deliberate: EXISTING rows were already learner-visible
-- before this migration, so they must stay visible (no retroactive unpublish).
-- The cron explicitly sets status='draft' on every new insert from now on.
--
-- Read-surface inventory (why RPCs, not a SELECT policy, are what we tighten):
-- scf_learner_notes has RLS ENABLED with NO policies + REVOKE ALL from
-- anon/authenticated (20260630210000) — direct table access is deny-all and
-- EVERY read flows through the SECURITY DEFINER RPCs below. Tightening the two
-- read RPCs therefore gates every read surface:
--   1. fn_scf_my_struggling_note  → hooks/use-learner-loop.ts →
--      app/(routes)/learners/class-feedback/_components/struggling-note-card.tsx
--      (the ONLY student-facing surface)
--   2. fn_scf_struggling_notes_sent → hooks/use-struggling-notes-sent.ts
--      (leadership existence/timing signal — never the wording)
--   3. The cron's regen-guard SELECT runs via the service-role client
--      (RLS-bypassing) and intentionally still counts drafts/rejected rows:
--      a pending or rejected draft suppresses regeneration for that week.
-- =====================================================================

-- ── 1) status / approval columns ─────────────────────────────────────────────
-- Updated: 2026-07-03 - approval-queue columns on scf_learner_notes
ALTER TABLE public.scf_learner_notes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('draft', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE INDEX IF NOT EXISTS ix_scf_learner_notes_status
  ON public.scf_learner_notes (status);

COMMENT ON COLUMN public.scf_learner_notes.status IS
  'draft = written by cron, awaiting super-admin review (learner CANNOT see it); '
  'approved = learner-visible; rejected = never shown. Default approved so rows '
  'that predate the approval queue (already seen by students) stay visible.';
COMMENT ON COLUMN public.scf_learner_notes.approved_by IS
  'Super admin (auth.users.id) who reviewed the note via fn_scf_learner_notes_review '
  '(set on BOTH approve and reject — it records who made the call).';

-- ── 2) TIGHTEN learner self-read: only APPROVED notes are learner-visible ────
-- (CREATE OR REPLACE keeps the existing signature; the ONLY change is the
--  n.status = 'approved' condition.)
CREATE OR REPLACE FUNCTION public.fn_scf_my_struggling_note()
RETURNS TABLE(course_code text, course_name text, note text, generated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_lp uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_my_struggling_note: not authenticated';
  END IF;
  -- Identity chain: auth.uid() -> learners_profiles.profile_id -> lp.id
  -- (mirrors fn_scf_downward_trend_for_learner). The note.learner_id == lp.id.
  SELECT lp.id INTO v_lp
  FROM public.learners_profiles lp
  WHERE lp.profile_id = auth.uid();
  IF v_lp IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.course_code, n.course_name, n.note, n.generated_at
  FROM public.scf_learner_notes n
  WHERE n.learner_id = v_lp
    AND n.status = 'approved'   -- approval queue (2026-07-03): drafts/rejected are NEVER learner-visible
  ORDER BY n.generated_at DESC
  LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_my_struggling_note() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_my_struggling_note() TO authenticated;

-- ── 3) TIGHTEN leadership signal: "note sent" now means learner-VISIBLE ──────
-- A draft was never seen by the student, so counting it as "sent" would be
-- false after this change. Only approved notes appear here.
CREATE OR REPLACE FUNCTION public.fn_scf_struggling_notes_sent(p_from date, p_to date)
RETURNS TABLE(
  student_id      uuid,
  learner_name    text,
  register_number text,
  department_name text,
  course_code     text,
  notes_count     bigint,
  last_note_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inst uuid; v_super boolean; v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authenticated';
  END IF;
  -- AUDIENCE: narrowest leadership — principal/dean/institution-admin/super only.
  -- IDENTICAL gate to fn_scf_learner_trajectory. HOD/coordinator are intentionally
  -- EXCLUDED. The note-sent roster is a SUBSET of the named trajectory roster this
  -- same audience already sees, so it adds no new per-learner exposure — and the
  -- note's WORDING is never returned here.
  SELECT p.institution_id,
         (p.role = 'super_admin' OR p.is_super_admin = true),
         (p.role = ANY (ARRAY['super_admin','administrator','institution_admin','dean','principal']) OR p.is_super_admin = true)
    INTO v_inst, v_super, v_allowed
  FROM public.profiles p WHERE p.id = auth.uid();
  IF NOT COALESCE(v_allowed, false) THEN
    RAISE EXCEPTION 'fn_scf_struggling_notes_sent: not authorized';
  END IF;

  RETURN QUERY
  SELECT
    n.learner_id AS student_id,
    NULLIF(trim(COALESCE(lp.first_name,'') || ' ' || COALESCE(lp.last_name,'')), '')::text AS learner_name,
    lp.register_number::text                                                               AS register_number,
    COALESCE(d.department_name,'Unknown')::text                                            AS department_name,
    n.course_code,
    count(*)::bigint                                                                       AS notes_count,
    max(n.generated_at)                                                                    AS last_note_at
  FROM public.scf_learner_notes n
  LEFT JOIN public.learners_profiles lp ON lp.id = n.learner_id
  LEFT JOIN public.departments d        ON d.id = lp.department_id
  WHERE (v_super OR n.institution_id = v_inst)        -- institution-scoped (super sees all)
    AND n.status = 'approved'                         -- approval queue (2026-07-03): "sent" = learner-visible
    AND n.generated_at::date BETWEEN p_from AND p_to
  GROUP BY n.learner_id, lp.first_name, lp.last_name, lp.register_number, d.department_name, n.course_code
  ORDER BY max(n.generated_at) DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(date, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_struggling_notes_sent(date, date) TO authenticated;

-- ── 4) RPC: super admin lists pending drafts (full rows incl. note text) ─────
-- The approval must be a REAL review — the reviewing super admin reads the full
-- draft wording before deciding. That is the one deliberate exception to the
-- "note text is private to the learner" rule, and it applies to DRAFTS only.
CREATE OR REPLACE FUNCTION public.fn_scf_learner_notes_pending()
RETURNS SETOF public.scf_learner_notes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
    SELECT *
    FROM public.scf_learner_notes
    WHERE status = 'draft'
    ORDER BY week_of DESC, created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_learner_notes_pending() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_learner_notes_pending() TO authenticated;

-- ── 5) RPC: super admin bulk-reviews drafts (approve / reject) ───────────────
-- Only rows still in status='draft' are touched — re-submitting an id that was
-- already reviewed (or never existed) is a silent no-op reflected in
-- updated_count, so double-clicks and stale UI lists are race-safe.
CREATE OR REPLACE FUNCTION public.fn_scf_learner_notes_review(p_ids uuid[], p_action text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_action must be approve or reject');
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_ids must be a non-empty uuid array');
  END IF;

  UPDATE public.scf_learner_notes
     SET status      = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END,
         approved_by = auth.uid(),   -- reviewer identity (set on reject too — who made the call)
         approved_at = now(),
         updated_at  = now()
   WHERE id = ANY(p_ids)
     AND status = 'draft';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'action', p_action, 'updated_count', v_count);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_learner_notes_review(uuid[], text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_learner_notes_review(uuid[], text) TO authenticated;

-- Reload PostgREST schema cache so the new/updated RPCs are callable immediately.
NOTIFY pgrst, 'reload schema';
