-- ============================================================================
-- Doctrines weekly cards: emit a whole week in one statement, not one per user
-- Created: 2026-08-17
-- ----------------------------------------------------------------------------
-- WHAT IS BROKEN
--
-- /api/cron/friday-reflection and /api/cron/sunday-wrap each loop over every
-- eligible profile in JavaScript and make TWO sequential PostgREST round-trips
-- per user: a SELECT on idempotency_key, then an INSERT. Measured 2026-08-17:
--
--   friday-reflection   6,705 users -> 13,410 sequential round-trips
--   sunday-wrap         6,813 users -> 13,626 sequential round-trips
--
-- The AI-routine dispatcher aborts any routine at 120s
-- (AbortSignal.timeout(120_000) in app/api/cron/ai-routine-dispatcher/route.ts),
-- so both are cut off mid-loop and record
-- "error: The operation was aborted due to timeout".
--
-- This is NOT a dead routine - it is a PARTIAL one, which is worse, because the
-- failure is invisible in the output. Measured coverage per run:
--   sunday-wrap:       1,894 of 6,813 (28%) on 08-16, and FALLING every week --
--                      2,374 -> 2,146 -> 2,029 -> 1,935 -> 1,870 -> 1,841
--                      as public.notifications grows (298,721 rows today) and
--                      each per-user lookup costs fractionally more.
--   friday-reflection: erratic - 6,703 on 08-14, but only 51 on 07-10.
-- Roughly 4,900 people miss their weekly wrap, and WHICH people is arbitrary.
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS AN RPC AND NOT A PostgREST .upsert()
--
-- The obvious fix - one bulk `.upsert(rows, { onConflict: 'idempotency_key' })` -
-- DOES NOT WORK HERE, and fails at runtime rather than at build time.
--
-- public.notifications' unique index is PARTIAL:
--   CREATE UNIQUE INDEX idx_notifications_idempotency
--     ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;
--
-- PostgreSQL will not infer a partial index from a bare ON CONFLICT (col); the
-- statement must repeat the index predicate. PostgREST's on_conflict parameter
-- cannot express a WHERE clause, so the generated statement raises:
--   42P10  there is no unique or exclusion constraint matching the ON CONFLICT
--          specification
--
-- Verified on production 2026-08-17 inside BEGIN..ROLLBACK: the bare form
-- returned 42P10; the same insert with `WHERE idempotency_key IS NOT NULL`
-- appended to the conflict target succeeded. This function exists to carry that
-- predicate. (Same failure class as migration 20260809000000.)
--
-- ----------------------------------------------------------------------------
-- DELIVERY IS TWO WRITES, AND BOTH OF THEM LIVE HERE (merged with #3199)
--
-- An in-app card is delivered only when TWO rows exist: the `notifications` row
-- AND a `user_notifications` link row per recipient. The bell and inbox read
-- `user_notifications` with an `!inner` join back to `notifications`
-- (lib/services/notification/notification-service.ts) and NO database trigger
-- fans out, so a parent row without its link is invisible to the person it
-- names - permanently, and with no error anywhere.
--
-- Measured on production 2026-08-25, before #3199:
--   cron:friday-reflection   91,069 rows   0 linked   2026-04-24 -> 2026-08-21
--   cron:sunday-wrap         42,696 rows   0 linked   2026-04-26 -> 2026-08-23
-- 133,765 cards naming 7,170 real people, 0% delivered in every month since
-- launch, while both routes kept returning `cards_created: N`.
--
-- #3199 fixed that in JavaScript, by routing the per-user loop through
-- `fanoutNotification`. This migration removes the per-user loop entirely, so
-- the second write comes down with the first: the statement below inserts the
-- parent rows and their link rows together. It also HEALS - a card whose parent
-- already existed still gets its links asserted, which is exactly what
-- fanoutNotification does on its idempotent-skip path.
--
-- `linked` is returned alongside `inserted` so the callers can REPORT delivery
-- instead of assuming it. That is the whole lesson of the 2026-08-25
-- postmortem: the old failure was silent because nothing ever counted the
-- second write. ASSERT 4 refuses this migration if the fan-out is ever removed.
--
-- The link insert uses a NOT EXISTS anti-join rather than ON CONFLICT because
-- no UNIQUE (notification_id, user_id) index is declared anywhere in this repo
-- for `user_notifications` - every other SQL fan-out here inserts bare. An
-- ON CONFLICT naming a constraint that may not exist would raise 42P10 on every
-- call, which is the very failure class this file was written to avoid.
--
-- ----------------------------------------------------------------------------
-- GRANT NOTE - service_role ONLY, deliberately narrower than the house template
--
-- This function writes notifications addressed at ARBITRARY user ids supplied by
-- the caller. Granting it to `authenticated` would let any signed-in learner
-- emit notifications to anyone in the cluster. Only the cron path needs it, and
-- that path holds the service-role key. anon and authenticated are both revoked.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_doctrines_emit_cards(p_cards jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_received int;
  v_inserted int;
  v_linked   int;
  v_no_key   int;
BEGIN
  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RAISE EXCEPTION 'fn_doctrines_emit_cards expects a JSON array of cards, got %',
      coalesce(jsonb_typeof(p_cards), 'null');
  END IF;

  SELECT jsonb_array_length(p_cards) INTO v_received;
  IF v_received = 0 THEN
    RETURN jsonb_build_object('received', 0, 'inserted', 0, 'skipped_duplicate', 0, 'linked', 0);
  END IF;

  -- Every card MUST carry an idempotency_key. It is what dedupes the insert, and
  -- it is also the only handle that maps a freshly-inserted parent row back to
  -- the source card so its recipients can be linked. A keyless card would be
  -- inserted and then silently never delivered - the 2026-08-25 bug exactly - so
  -- this refuses loudly instead.
  SELECT count(*)::int INTO v_no_key
    FROM jsonb_array_elements(p_cards) AS c
   WHERE nullif(c ->> 'idempotency_key', '') IS NULL;
  IF v_no_key > 0 THEN
    RAISE EXCEPTION 'fn_doctrines_emit_cards: % of % cards have no idempotency_key; they could not be deduped or delivered',
      v_no_key, v_received;
  END IF;

  WITH incoming AS (
    SELECT
      c ->> 'title'                                   AS title,
      c ->> 'body'                                    AS body,
      c ->> 'url'                                     AS url,
      c ->> 'icon'                                    AS icon,
      (c ->> 'created_by')::uuid                      AS created_by,
      c -> 'targeting'                                AS targeting,
      coalesce(c ->> 'priority', 'normal')            AS priority,
      c ->> 'category'                                AS category,
      coalesce(c ->> 'kind', 'work_item')             AS kind,
      c ->> 'idempotency_key'                         AS idempotency_key,
      nullif(c ->> 'expires_at', '')::timestamptz     AS expires_at,
      coalesce(c -> 'metadata', '{}'::jsonb)          AS metadata
    FROM jsonb_array_elements(p_cards) AS c
  ), ins AS (
    INSERT INTO public.notifications
      (title, body, url, icon, created_by, targeting, priority,
       category, kind, idempotency_key, expires_at, metadata)
    SELECT title, body, url, icon, created_by, targeting, priority,
           category, kind, idempotency_key, expires_at, metadata
    FROM incoming
    -- The predicate is load-bearing: without it this raises 42P10 against the
    -- PARTIAL unique index. Do not "simplify" it away.
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING id, idempotency_key
  ), already AS (
    -- The cards ON CONFLICT skipped. A sibling CTE cannot see rows inserted by
    -- `ins` (one snapshot), so this join returns exactly the pre-existing
    -- parents - which is what makes the heal below correct rather than a
    -- double-count.
    SELECT n.id, n.idempotency_key
      FROM public.notifications n
      JOIN incoming i ON i.idempotency_key = n.idempotency_key
  ), resolved AS (
    SELECT id, idempotency_key FROM ins
    UNION ALL
    SELECT id, idempotency_key FROM already
  ), recipients AS (
    SELECT DISTINCT
           r.id                AS notification_id,
           (u.value)::uuid     AS user_id
      FROM resolved r
      JOIN incoming i ON i.idempotency_key = r.idempotency_key
      CROSS JOIN LATERAL jsonb_array_elements_text(
             coalesce(i.targeting -> 'user_ids', '[]'::jsonb)) AS u(value)
     WHERE nullif(u.value, '') IS NOT NULL
  ), links AS (
    -- The second write. Anti-join, not ON CONFLICT: see the header note.
    INSERT INTO public.user_notifications (notification_id, user_id)
    SELECT rc.notification_id, rc.user_id
      FROM recipients rc
     WHERE NOT EXISTS (
       SELECT 1 FROM public.user_notifications un
        WHERE un.notification_id = rc.notification_id
          AND un.user_id         = rc.user_id
     )
    RETURNING 1
  )
  SELECT (SELECT count(*)::int FROM ins),
         (SELECT count(*)::int FROM links)
    INTO v_inserted, v_linked;

  RETURN jsonb_build_object(
    'received',          v_received,
    'inserted',          v_inserted,
    'skipped_duplicate', v_received - v_inserted,
    -- Link rows written this call: the new cards' links PLUS any pre-existing
    -- card whose links were missing and have just been healed. Callers surface
    -- this so a delivery hole is COUNTED instead of silent.
    'linked',            v_linked
  );
END;
$$;

REVOKE ALL     ON FUNCTION public.fn_doctrines_emit_cards(jsonb) FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_doctrines_emit_cards(jsonb) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_doctrines_emit_cards(jsonb) TO service_role;

COMMENT ON FUNCTION public.fn_doctrines_emit_cards(jsonb) IS
  'Bulk-emits doctrines weekly cards in ONE statement, doing BOTH writes delivery needs - the notifications row and its user_notifications link - and healing links for cards that already existed. Carries the partial-index predicate on ON CONFLICT, which PostgREST cannot express. Returns received/inserted/skipped_duplicate/linked so callers can report delivery rather than assume it. service_role only: it writes notifications addressed at arbitrary user ids.';

-- ---------------------------------------------------------------------------
-- Assertions. Any failure rolls the whole migration back.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_doctrines_emit_cards';

  -- ASSERT 1 - the partial-index predicate survived. Without it every call 42P10s.
  IF v_def NOT LIKE '%WHERE idempotency_key IS NOT NULL%' THEN
    RAISE EXCEPTION 'fn_doctrines_emit_cards lost the ON CONFLICT predicate - it would raise 42P10 on every call';
  END IF;

  -- ASSERT 2 - the partial unique index it infers must still exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public' AND tablename='notifications'
       AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%idempotency_key%'
       AND indexdef LIKE '%idempotency_key IS NOT NULL%'
  ) THEN
    RAISE EXCEPTION 'the partial unique index on notifications.idempotency_key is gone - refusing';
  END IF;

  -- ASSERT 3 - nobody but service_role may emit notifications to arbitrary users.
  IF has_function_privilege('anon',          'public.fn_doctrines_emit_cards(jsonb)', 'EXECUTE')
  OR has_function_privilege('authenticated', 'public.fn_doctrines_emit_cards(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fn_doctrines_emit_cards is reachable by anon or authenticated - refusing to widen it';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.fn_doctrines_emit_cards(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot EXECUTE fn_doctrines_emit_cards - the cron would still fail';
  END IF;

  -- ASSERT 4 - the SECOND write must still be here. Composing a notifications row
  -- without its user_notifications link delivers nothing and says nothing: that is
  -- how 133,765 cards reached 0 people between 2026-04-24 and 2026-08-25 (#3199).
  -- If a future edit drops the fan-out, this migration refuses rather than
  -- silently reopening that hole.
  IF v_def NOT LIKE '%INSERT INTO public.user_notifications%' THEN
    RAISE EXCEPTION 'fn_doctrines_emit_cards no longer writes user_notifications - every card it emits would reach nobody';
  END IF;

  -- ASSERT 5 - and it must still report how many links it wrote, so a partial
  -- delivery is visible in the cron output instead of being assumed away.
  IF v_def NOT LIKE '%''linked''%' THEN
    RAISE EXCEPTION 'fn_doctrines_emit_cards stopped returning linked - delivery would go uncounted again';
  END IF;
END
$assert$;

COMMIT;
