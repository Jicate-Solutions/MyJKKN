-- ============================================================================
-- Freeze the filed figures — the WRITER for Director decision 7.
--
-- Date: 2026-08-02
-- Version: 20260809100400
-- Status: FILE ONLY — NOT APPLIED to any database. Director-gated apply.
--
-- WHAT THIS CLOSES
-- ----------------
-- Director decision 7 (2026-08-01): "the numbers move after a submission is
-- filed, so both the figure that was REPORTED and the figure that is ACTUAL
-- today must be retrievable."
--
-- `fn_accreditation_reported_vs_actual` (migration 20260809100000, PR #2771)
-- reads `accreditation_submissions.metadata -> 'reported_metrics'` and returns
-- reported / actual / drift per metric. It is a complete READER over a key that
-- NOTHING WRITES. Read live 2026-08-02: zero submissions carry the key, so the
-- function returns `reported = NULL` on every row and the drift column is
-- always NULL. Decision 7 is half-built.
--
-- This file is the other half: one deliberate act that records what was filed.
--
-- THE RESERVED SHAPE — set by 20260809100000 as a column comment, honoured here
-- ---------------------------------------------------------------------------
--   metadata = {
--     "reported_metrics": { "<metric_code>": <number>, ... },
--     "reported_at": "<ISO 8601>"
--   }
--
-- Everything already in `metadata` survives: the write is `metadata || {...}`,
-- a MERGE of two top-level keys, never a replacement of the column. The export
-- page writes `filename`, `metrics_seeded`, `evidence_rows`, `exported_at` and
-- `note` into that same object today, and all five are still there afterwards.
--
-- WHY AN RPC AND NOT A TRIGGER
-- ---------------------------
-- A `BEFORE UPDATE OF submitted_at` trigger would fire on every path that sets
-- the column — including a bulk repair, a backfill, or a future admin screen
-- that corrects a typo in a filing date. Each of those would silently stamp
-- today's counts onto a filing from last year, which is precisely the drift the
-- feature exists to expose. Freezing is a judgement ("this is what we filed"),
-- so it gets an explicit call with an explicit caller.
--
-- WHY IT ALSO PERFORMS THE FILING TRANSITION
-- -----------------------------------------
-- Measured on this branch: nothing in the application ever sets
-- `accreditation_submissions.submitted_at` (grep across `app/`, `lib/`,
-- `components/`, `hooks/` — every hit belongs to Startup Studio or the
-- stakeholder surveys). The reader filters `submitted_at IS NOT NULL`, so a
-- frozen snapshot on a row that was never marked filed would be invisible to
-- the only function that reads it. Freezing and filing are the same act here,
-- and this function performs both — conservatively: `submitted_at` is set only
-- when it is NULL, never rewritten, and `status` moves only from 'draft'.
--
-- WRITE-ONCE, ON PURPOSE
-- ---------------------
-- A filed figure is a historical fact. Re-freezing would rewrite history to
-- match the present and destroy the drift the feature exists to show, so a
-- second call RAISEs (SQLSTATE 55000) and changes nothing. There is no
-- re-freeze entry point, no force flag, and no UPDATE path that overwrites the
-- key — correcting a wrong filing is a deliberate, auditable act for a DBA, not
-- a button.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 — The freeze
--
-- Takes ONLY the submission id. Caller identity comes from the session, never
-- from an argument: a SECURITY DEFINER function that accepts the user it should
-- act as is an IDOR, and 75 functions of that shape already exist in this
-- database. Every guard is wrapped in COALESCE(..., false) because a NULL guard
-- falls through and grants access.
--
-- The permission checked is `accreditation.submissions.manage` — the exact key
-- the live `submissions_update` RLS policy demands (20260417000001 §RLS). This
-- function is SECURITY DEFINER and therefore bypasses that policy, so checking
-- the same key by hand is what keeps the two layers saying the same thing.
--
-- ⚠️ `accreditation.submissions.manage` is registered in NO catalog today and
-- held by NOBODY (`lib/constants/permissions.ts` has no `accreditation.
-- submissions.*` entry; open PR #2769 adds it). Until that merges and a role is
-- granted the key, the only callers who pass this guard are super administrators
-- and admins via the bypass branches. That is a deliberate choice: the guard
-- names what the database already requires rather than inventing a second key
-- that would drift from the RLS.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_accreditation_freeze_reported_figures(
  p_submission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub          public.accreditation_submissions%ROWTYPE;
  v_metrics      jsonb;
  v_evidence     bigint;
  v_now          timestamptz := now();
  v_reported_at  text;
BEGIN
  -- FOR UPDATE, not a bare SELECT: two concurrent freezes of the same
  -- submission would otherwise both read "not yet frozen" and the second would
  -- overwrite the first. The lock makes the write-once check below binding.
  SELECT * INTO v_sub
    FROM public.accreditation_submissions
   WHERE id = p_submission_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accreditation submission % does not exist', p_submission_id
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    COALESCE((SELECT is_super_admin()), false)
    OR COALESCE((SELECT is_admin()), false)
    OR (
      COALESCE((SELECT user_has_permission('accreditation.submissions.manage')), false)
      AND COALESCE(role_has_institution_access(v_sub.institution_id), false)
    )
  ) THEN
    RAISE EXCEPTION 'not authorised to freeze the filed figures for this submission'
      USING ERRCODE = '42501';
  END IF;

  -- Write-once. `?` tests key EXISTENCE, which is the right question here: a
  -- freeze that captured zero metrics is still a freeze, and `{}` must not read
  -- as "never frozen" and invite a re-freeze.
  IF COALESCE(v_sub.metadata, '{}'::jsonb) ? 'reported_metrics' THEN
    RAISE EXCEPTION
      'submission % froze its filed figures at % and they are never rewritten — the gap between that number and today is the answer this feature exists to give',
      p_submission_id,
      COALESCE(v_sub.metadata ->> 'reported_at', 'an unrecorded time')
      USING ERRCODE = '55000';
  END IF;

  -- The counts MUST be gathered exactly the way the reader gathers `actual`,
  -- or the drift is fabricated at the moment of filing. This is a copy of the
  -- `actual_rows` CTE in fn_accreditation_reported_vs_actual: same three
  -- predicates, same GROUP BY, same plain `=` on period_label (so a mapping row
  -- with a NULL period_label is counted by neither side).
  SELECT
    COALESCE(jsonb_object_agg(t.metric_code, t.n), '{}'::jsonb),
    COALESCE(SUM(t.n), 0)::bigint
  INTO v_metrics, v_evidence
  FROM (
    SELECT m.metric_code, count(*)::bigint AS n
      FROM public.quality_evidence_mappings m
     WHERE m.institution_id = v_sub.institution_id
       AND m.body_code      = v_sub.body_code
       AND m.period_label   = v_sub.period_label
     GROUP BY m.metric_code
  ) t;

  v_reported_at := to_char(v_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  UPDATE public.accreditation_submissions s
     SET metadata = COALESCE(s.metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'reported_metrics', v_metrics,
                         'reported_at',      v_reported_at
                       ),
         -- COALESCE, never assignment: a filing timestamp that already exists
         -- is itself a historical fact and this function does not move it.
         submitted_at = COALESCE(s.submitted_at, v_now),
         submitted_by = COALESCE(
                          s.submitted_by,
                          (SELECT p.id FROM public.profiles p WHERE p.id = auth.uid())
                        ),
         -- Only 'draft' advances. 'accepted', 'revision_requested', 'rejected'
         -- and 'withdrawn' are outcomes the body decided; freezing our own
         -- figures does not undo them.
         status       = CASE WHEN s.status = 'draft' THEN 'submitted' ELSE s.status END,
         updated_at   = v_now
   WHERE s.id = p_submission_id;

  RETURN jsonb_build_object(
    'submission_id',    p_submission_id,
    'reported_metrics', v_metrics,
    'reported_at',      v_reported_at,
    'metric_count',     (SELECT count(*) FROM jsonb_object_keys(v_metrics)),
    'evidence_rows',    v_evidence,
    'body_code',        v_sub.body_code,
    'period_label',     v_sub.period_label,
    'institution_id',   v_sub.institution_id
  );
END;
$$;

COMMENT ON FUNCTION public.fn_accreditation_freeze_reported_figures(uuid) IS
  'Writes the reserved `reported_metrics` / `reported_at` keys into '
  'accreditation_submissions.metadata by MERGE, marks the submission filed if it '
  'is not already, and returns the frozen snapshot. WRITE-ONCE: a second call on '
  'the same submission raises SQLSTATE 55000 and changes nothing. Counterpart '
  'writer to fn_accreditation_reported_vs_actual(). Director decision 7, '
  '2026-08-01.';

-- Supabase's ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function
-- separately from PUBLIC, so revoking PUBLIC alone leaves it callable with the
-- anon key embedded in every browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_freeze_reported_figures(uuid)
  FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_freeze_reported_figures(uuid)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- §2 — Assert, in this transaction, that the intent above actually took
--
-- A REVOKE that silently did nothing is the failure mode this catches: the
-- statement succeeds, the ACL is unchanged, and the migration reports success.
--
-- `has_function_privilege('public', …)` is NOT used — there is no role literally
-- named `public`, and that call RAISEs. PUBLIC is read out of `pg_proc.proacl`
-- via aclexplode, treating a NULL proacl as LEAKY (for functions, no ACL entry
-- means the built-in EXECUTE-to-PUBLIC default is still in force).
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_accreditation_freeze_reported_figures';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'fn_accreditation_freeze_reported_figures was not created';
  END IF;

  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) THEN
    RAISE EXCEPTION 'fn_accreditation_freeze_reported_figures is not SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = v_oid
       AND p.proconfig @> ARRAY['search_path=public']
  ) THEN
    RAISE EXCEPTION 'fn_accreditation_freeze_reported_figures is missing SET search_path = public';
  END IF;

  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can still execute fn_accreditation_freeze_reported_figures';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      LEFT JOIN LATERAL aclexplode(p.proacl) a ON true
     WHERE p.oid = v_oid
       AND (p.proacl IS NULL OR (a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'PUBLIC can still execute fn_accreditation_freeze_reported_figures';
  END IF;

  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute fn_accreditation_freeze_reported_figures';
  END IF;
END $$;
