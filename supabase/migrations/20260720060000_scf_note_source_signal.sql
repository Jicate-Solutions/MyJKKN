-- Migration: 20260720060000_scf_note_source_signal.sql
-- Purpose: Persist the source signal each SCF learner-note was built from, so the
--   shadow safety judge can VERIFY the note faithfully renders real records instead
--   of FALSE-FLAGGING real (DB-grounded) ratings/dates/facilitator as "invented".
--
-- Root cause (verified 2026-07-20): buildJudgePrompt() fed the judge only the note
--   text + course_code + a scalar net_decline. Every real specific the note
--   faithfully rendered (e.g. "3,3,1 on 6-8 Jul", "Dr R. Sasikumar") read to the
--   judge as "not in the context I was given" -> 0/1135 auto_safe, 11 false
--   likely_unsafe. Ground-truth: note 4e964bf0's "3,3,1 on 6,7,8 Jul / hodmech"
--   matched session_feedback EXACTLY. The generator is grounded (SYSTEM_PROMPT:
--   "Do not invent anything not in the data"); the judge was blindfolded.
--
-- This migration is SHADOW-SAFE: it only adds a column, backfills it, and widens
-- the (service_role-only) awaiting RPC's return. It does NOT touch note status and
-- does NOT change any grant surface (anon/authenticated remain revoked).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Column: the exact inputs used to build the note. jsonb, nullable. A null
--    signal makes the judge fall back to its old text-only behavior (no regression).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.scf_learner_notes
  ADD COLUMN IF NOT EXISTS source_signal jsonb;

COMMENT ON COLUMN public.scf_learner_notes.source_signal IS
  'The real signal this note was rendered from: {ratings[], rated_on[], unmet_items[], faculty_name, net_decline}. Fed to the shadow safety judge so it verifies faithfulness instead of false-flagging grounded specifics. Added 2026-07-20 (see scf-note-safety loop).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Backfill existing drafts from raw session_feedback. The last 3 understood
--    ratings at/before generated_at for (learner, course) reconstruct ratings[] +
--    rated_on[] + faculty (proven exact on note 4e964bf0). unmet_items is NOT in
--    session_feedback -> absent (judge treats missing as "rely on ratings"). The
--    faculty NAME is resolved from profiles.email when available, else the email
--    itself (either way the judge learns a REAL facilitator exists -> stop flagging).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.scf_learner_notes n
SET source_signal = jsonb_build_object(
      'ratings',      sig.ratings,
      'rated_on',     sig.dates,
      'faculty_name', sig.faculty_name,
      'net_decline',  n.net_decline,
      'backfilled',   true
    )
FROM (
  SELECT nn.id AS note_id,
         array_agg(t.understood      ORDER BY t.attendance_date) AS ratings,
         array_agg(t.attendance_date ORDER BY t.attendance_date) AS dates,
         COALESCE(
           max(p.full_name),     -- resolved facilitator name, if the email maps to a profile
           max(t.faculty_email)  -- else the raw email (still proves a real facilitator exists)
         ) AS faculty_name
  FROM public.scf_learner_notes nn
  JOIN LATERAL (
    SELECT sf.understood, sf.attendance_date, sf.faculty_email
    FROM public.session_feedback sf
    WHERE sf.student_id = nn.learner_id
      AND sf.course_code = nn.course_code
      AND sf.attendance_date <= nn.generated_at::date
    ORDER BY sf.attendance_date DESC
    LIMIT 3
  ) t ON true
  LEFT JOIN public.profiles p ON p.email = t.faculty_email
  WHERE nn.status = 'draft' AND nn.source_signal IS NULL
  GROUP BY nn.id
) sig
WHERE n.id = sig.note_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Widen the awaiting-judgement RPC to also return source_signal. Return-type
--    change requires DROP + CREATE (CREATE OR REPLACE cannot alter OUT columns).
--    Re-apply the exact hardened grant surface: service_role ONLY (anon +
--    authenticated + PUBLIC revoked). Cron/system-only SECDEF RPC -> service_role,
--    NOT authenticated (authenticated would be a cross-tenant PII read of private
--    learner note text).
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.fn_scf_notes_awaiting_judgement(integer);

CREATE FUNCTION public.fn_scf_notes_awaiting_judgement(p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid, note text, net_decline smallint, course_code text, source_signal jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
    SELECT n.id, n.note, n.net_decline, n.course_code, n.source_signal
    FROM public.scf_learner_notes n
    WHERE n.status = 'draft'
      AND NOT EXISTS (SELECT 1 FROM public.scf_note_judgements j WHERE j.note_id = n.id)
    ORDER BY n.generated_at ASC
    LIMIT GREATEST(1, LEAST(500, p_limit));
END; $function$;

REVOKE EXECUTE ON FUNCTION public.fn_scf_notes_awaiting_judgement(integer) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_scf_notes_awaiting_judgement(integer) TO service_role;
