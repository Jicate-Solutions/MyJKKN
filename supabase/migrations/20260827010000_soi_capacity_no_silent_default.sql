-- ============================================================================
-- School of Influence — A MISSING CAPACITY POLICY MUST BE LOUD, NEVER 30.
--
-- Date: 2026-08-27   Ticket: soi-capacity-silent-default
--
-- WHAT IS WRONG TODAY
-- -------------------
-- fn_soi_review_batches (shipped in 20260808146000) declares
--
--     c_default_capacity constant integer := 30;
--
-- and uses it TWICE in the same expression, as fn_get_policy_int's default and
-- again as a COALESCE fallback:
--
--     GREATEST(COALESCE(fn_get_policy_int('soi.batch_capacity',
--                                         c_default_capacity, c.id),
--                       c_default_capacity), 1) AS cap
--
-- The number that is actually correct lives in the database, not in that line.
-- Read on production 2026-08-13: platform_policies holds exactly ONE row for
-- soi.batch_capacity — scope_type 'cohort', scope_id NULL, value 50, is_active
-- true, publication_state 'published'. That single row is the only reason every
-- batch shows 50 seats. Delete it — one row, one click on the Platform Policies
-- screen, or one cleanup script — and every batch silently becomes 30 seats.
-- No error, no warning, no log line. The screen looks completely normal; it is
-- simply wrong by 20 places per batch, and fn_soi_prepare_acceptance enforces
-- the same wrong number on the write, so the accept path starts refusing real
-- applicants at 30. That is precisely the failure that had to be corrected by
-- hand on 2026-08-13.
--
-- A default is only safe when being wrong is cheap. A seat count is a number
-- someone is turned away by, so guessing it is worse than stopping.
--
-- WHAT THIS MIGRATION CHANGES
-- ---------------------------
-- The literal 30 is REMOVED from the function body entirely. In its place the
-- function pre-checks, once, that soi.batch_capacity actually resolves for every
-- batch of this programme, and RAISES a sentence naming the missing policy key
-- when it does not. A coordinator then sees "the capacity is not configured"
-- instead of a plausible, silently halved seat count.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT CHANGE
-- ------------------------------------------------
--   * CREATE OR REPLACE, and the RETURNS TABLE column list is byte-identical.
--     Changing any OUT column would require a DROP, and fn_soi_prepare_acceptance
--     does `SELECT * INTO v_batch FROM fn_soi_review_batches(...)` on the LIVE
--     accept path — a DROP would break it mid-flight. Same constraint documented
--     in open PR #2766.
--   * LANGUAGE plpgsql, STABLE, SECURITY DEFINER, SET search_path TO
--     'public', 'pg_temp' — all preserved verbatim.
--   * The fn_soi_can_review_applications 42501 permission gate at the top, and
--     its message, are preserved verbatim and still run FIRST: a caller with no
--     access must be told about access, not about configuration.
--   * c_default_behaviour and c_default_per_batch are LEFT ALONE. They are
--     genuine locked spec §4 defaults, not traps: an unrecognised
--     soi.batch_full_behaviour falls back to offering another batch, and a
--     missing soi.intake_dates_per_batch falls back to per-batch windows. Being
--     wrong about either is recoverable and visible; being wrong about a seat
--     count is neither.
--   * Occupancy, behaviour, window and ordering are copied unchanged from the
--     live body (captured from pg_get_functiondef on production 2026-08-13, not
--     retyped from the spec).
--   * No TypeScript change. review-service.ts's explain() already preserves an
--     RPC's own message verbatim and only maps 42501 to HTTP 403, so the new
--     sentence reaches the coordinator's screen as written, as a 400.
--
-- ERRCODE 22023 (invalid_parameter_value) matches the convention already used
-- across the School of Influence functions for "the configuration you gave me
-- cannot be used"; 42501 stays reserved for permission refusals.
--
-- NO BEGIN/COMMIT IN THIS FILE. Supabase's migration runner wraps it, and an
-- inner COMMIT would defeat a reviewer's BEGIN..ROLLBACK rehearsal against
-- production.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_soi_review_batches(p_event_id uuid)
RETURNS TABLE (
  cohort_id      uuid,
  batch_name     text,
  cohort_status  text,
  opens_at       timestamptz,
  closes_at      timestamptz,
  occupancy      integer,
  capacity       integer,
  is_full        boolean,
  full_behaviour text,
  intake_open    boolean,
  accepting_now  boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- Spec §4 locked defaults, declared once.
  --
  -- soi.batch_capacity is NO LONGER among them. A seat count has no safe
  -- fallback, so there is deliberately no capacity constant left in this body
  -- to fall back TO.
  c_default_behaviour constant text    := 'offer_another_batch';
  c_default_per_batch constant boolean := true;
  -- The name of the first batch whose capacity policy resolves to nothing, or
  -- NULL when every batch is configured.
  v_uncapped_batch    text;
BEGIN
  IF NOT COALESCE(public.fn_soi_can_review_applications(p_event_id), false) THEN
    RAISE EXCEPTION 'You do not have permission to review applications for this School of Influence programme. Ask a programme coordinator or an administrator — it needs the "cohort.manage" permission for this institution.'
      USING ERRCODE = '42501';
  END IF;

  -- ── The capacity policy must exist. ───────────────────────────────────────
  -- Checked per batch, not once for the programme, because fn_get_policy
  -- resolves soi.batch_capacity against the batch's own cohorts.id: a
  -- cohort-scoped override can exist for one batch and not another, so "the
  -- key resolves somewhere" is not the same question as "the key resolves for
  -- this batch".
  --
  -- ⚠️ The FROM/WHERE below is the SAME batch set as the RETURN QUERY's inner
  -- query. If one is ever edited, edit both — a narrower check here would let an
  -- unconfigured batch through, and a wider one would refuse a programme that is
  -- actually fine.
  --
  -- NULL::integer is passed as fn_get_policy_int's default (the parameter has no
  -- DEFAULT of its own and must be supplied) so the reader reports "not set"
  -- instead of inventing a number.
  SELECT c.name
    INTO v_uncapped_batch
    FROM public.cohorts c
   WHERE c.kind = 'school_of_influence'
     AND c.archived_at IS NULL
     AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
     AND public.fn_get_policy_int('soi.batch_capacity', NULL::integer, c.id) IS NULL
   ORDER BY c.name
   LIMIT 1;

  IF v_uncapped_batch IS NOT NULL THEN
    RAISE EXCEPTION 'Batch capacity is not configured: the platform policy "soi.batch_capacity" resolves to no value for batch "%". Publish that policy on the Platform Policies screen before reviewing applications — no seat count is assumed on its behalf, because a guessed one would quietly turn applicants away.', v_uncapped_batch
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.name,
    b.status::text,
    b.opens_at,
    b.closes_at,
    b.seats,
    b.cap,
    (b.seats >= b.cap),
    b.behaviour,
    b.window_open,
    (b.window_open AND b.seats < b.cap)
  FROM (
    SELECT
      c.id,
      c.name,
      c.status,
      c.opens_at,
      c.closes_at,
      -- One definition of "a seat is occupied": every non-terminal membership.
      -- Mirrors uniq_soi_one_active_batch_per_person exactly.
      (SELECT COUNT(*)::integer
         FROM public.cohort_memberships m
        WHERE m.cohort_id = c.id
          AND m.status NOT IN ('graduated', 'removed')) AS seats,
      -- No COALESCE and no fallback constant: the pre-check above has already
      -- established that this reader returns a value for every batch in this
      -- set, and it runs under the same snapshot as this query because the
      -- function is STABLE. GREATEST(..., 1) is kept for what it was always
      -- for — clamping a configured 0 or a negative to one seat — and not as a
      -- disguised default.
      GREATEST(
        public.fn_get_policy_int('soi.batch_capacity', NULL::integer, c.id),
        1
      ) AS cap,
      -- Read ONCE, then validated. Calling the reader twice (once to test, once
      -- to return) would let two reads of the same key disagree and return a
      -- value the test never saw. An unrecognised value falls back to the locked
      -- §4 default rather than being passed through.
      (SELECT CASE
                WHEN t.raw IN ('waitlist', 'offer_another_batch') THEN t.raw
                ELSE c_default_behaviour
              END
         FROM (SELECT public.fn_get_policy_text('soi.batch_full_behaviour',
                                                c_default_behaviour, c.id) AS raw) t
      ) AS behaviour,
      -- D13 off = one set of dates covers the whole programme, so an individual
      -- batch stops gating on its own window.
      CASE
        WHEN COALESCE(public.fn_get_policy_bool('soi.intake_dates_per_batch',
                                                c_default_per_batch, c.id),
                      c_default_per_batch)
        THEN (c.opens_at IS NULL OR now() >= c.opens_at)
             AND (c.closes_at IS NULL OR now() <= c.closes_at)
        ELSE true
      END AS window_open
    FROM public.cohorts c
    WHERE c.kind = 'school_of_influence'
      AND c.archived_at IS NULL
      AND NULLIF(btrim(c.config ->> 'source_event_id'), '')::uuid = p_event_id
  ) b
  ORDER BY b.name;
END;
$$;

COMMENT ON FUNCTION public.fn_soi_review_batches(uuid) IS
  'School of Influence S5 (D5/D13): every batch of one programme with its '
  'occupancy (non-terminal memberships), soi.batch_capacity, '
  'soi.batch_full_behaviour and intake window, all read at call time. The same '
  'numbers the accept path enforces, so screen and write cannot disagree. '
  'Capacity has NO code-side default: if soi.batch_capacity resolves to nothing '
  'the function raises 22023 naming the key, because a guessed seat count turns '
  'real applicants away silently.';

-- Re-asserted in the same file as the CREATE OR REPLACE. Supabase's
-- ALTER DEFAULT PRIVILEGES grants anon EXECUTE on every new function separately
-- from PUBLIC, so a replace must lock it again or the RPC becomes callable with
-- the anon key that ships in every browser bundle.
REVOKE EXECUTE ON FUNCTION public.fn_soi_review_batches(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_soi_review_batches(uuid) TO authenticated;
