-- ============================================================================
-- Migration: an allocator that can actually see the whole resource_code space
-- Date: 2026-09-11
-- Bug:  BUG-003978 — "A resource with this code already exists. Please use a
--       different code." raised for RES-SPA-JKKN-0009 against a user who owns
--       no such resource and cannot see one.
--
-- WHY THIS EXISTS
--   generateResourceCode() (lib/utils/resource-id-generator.ts) compresses the
--   institution name to its FIRST FOUR alpha characters. All eleven
--   JKKN-family institutions compress to "JKKN", so they share one
--   `RES-<CAT>-JKKN-` prefix and therefore ONE suffix space, while
--   resources.resource_code carries a single GLOBAL unique index.
--
--   Both halves of the old allocation path were ordinary PostgREST selects
--   issued as the signed-in user:
--
--     probe    .from('resources').eq('resource_code', code).maybeSingle()
--     max scan .from('resources').like('resource_code', prefix || '%')
--
--   Row-level security narrows both to the caller's own institution. A code
--   already held by a SIBLING institution is therefore INVISIBLE:
--
--     1. the probe reports the code free,
--     2. MAX(suffix) comes back stale (it only counts the caller's own rows),
--     3. the INSERT meets the real, unfiltered unique index and raises 23505,
--     4. the retry loop re-runs the same two narrowed reads and recomputes the
--        SAME stale value — five identical attempts, then the toast.
--
--   The RLS asymmetry itself is deliberately NOT being changed (owner ruling,
--   2026-09-11). This file works around the narrowed read instead, by moving
--   the two reads into a function that runs with the definer's rights.
--
-- WHAT THIS DOES
--   public.fn_allocate_resource_code(p_prefix, p_candidate) returns a code
--   string. It reads public.resources as the function owner, so it sees every
--   row in the prefix family regardless of who is asking. It:
--     • echoes p_candidate back when the FULL (unfiltered) table says that
--       exact code is free — a hand-typed custom code keeps working;
--     • otherwise returns p_prefix || lpad(MAX(suffix) + 1, 4, '0'), the MAX
--       taken across the ENTIRE prefix family.
--   It writes nothing. It creates no row. It is a pure read plus arithmetic.
--
-- CONCURRENCY — what is guaranteed and what is not
--   pg_advisory_xact_lock(hashtext('resource_code_allocator:' || prefix))
--   serialises every allocation for one prefix family. Two simultaneous
--   callers cannot interleave their scan with each other's scan, so neither
--   can read a half-formed view of the family; the lock is released at the end
--   of the function's own transaction, which for a PostgREST RPC is the end of
--   the call, so it can never be leaked across pooled connections.
--
--   What an advisory lock CANNOT do here: reserve the code. The brief says the
--   allocator must not insert anything, so allocation and the INSERT that
--   consumes the code are necessarily two separate transactions. If caller B
--   allocates in the gap between caller A's allocation and A's COMMIT, B is
--   handed the same suffix. That residual window is closed by the two
--   mechanisms that were already in place and are deliberately kept:
--     • the GLOBAL unique index on resources.resource_code — the real arbiter,
--       which cannot be fooled by RLS; and
--     • the caller's retry loop, which now CONVERGES: on a 23505 it asks this
--       function again, and because this function's MAX is unfiltered it sees
--       the winner's freshly committed row and returns the next value. The old
--       loop re-derived the identical stale number five times, which is why
--       the user ever saw the error at all.
--   A reservation table (or a per-prefix sequence) would close the window
--   completely; both were rejected here because they write, and because the
--   correct long-term fix is a wider institution code, not a wider allocator.
--
-- SECURITY
--   SECURITY DEFINER with a pinned search_path. Input is validated against a
--   strict prefix shape before it reaches LIKE, so a caller cannot smuggle a
--   `%` or `_` wildcard in and widen the scan to the whole table. The function
--   returns a STRING ONLY — never a row, never an id, never a name — so it
--   discloses nothing about a sibling institution beyond the fact that some
--   suffix is in use, which the unique index already reveals on insert.
--   EXECUTE granted to `authenticated` only; anon, PUBLIC and service_role
--   revoked.
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- NOT APPLIED BY THIS PR — apply via the Supabase Management API after merge.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_allocate_resource_code(
  p_prefix    text,
  p_candidate text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix     text;
  v_candidate  text;
  v_prefix_len integer;
  v_max        bigint;
  v_next       bigint;
  v_code       text;
  v_taken      boolean;
  v_guard      integer := 0;
BEGIN
  v_prefix := upper(btrim(COALESCE(p_prefix, '')));

  -- Strict shape: RES-<CAT>-<INST>- with alphanumerics only. This is what
  -- generateResourceCode emits, and it contains no LIKE metacharacter, so the
  -- scan below cannot be widened by a crafted argument.
  IF v_prefix !~ '^RES-[A-Z0-9]{2,12}-[A-Z0-9]{2,12}-$' THEN
    RAISE EXCEPTION
      'fn_allocate_resource_code: unusable prefix %', p_prefix
      USING ERRCODE = '22023';
  END IF;

  v_prefix_len := char_length(v_prefix);

  -- Serialise every allocation for this prefix family. Transaction-scoped, so
  -- it is released when this call's transaction ends — never held across a
  -- pooled connection.
  PERFORM pg_advisory_xact_lock(hashtext('resource_code_allocator:' || v_prefix));

  -- 1. A candidate the FULL table agrees is free is handed straight back, so a
  --    deliberately chosen code survives. (The caller's own probe cannot make
  --    this decision: RLS hides sibling rows from it.)
  v_candidate := upper(btrim(COALESCE(p_candidate, '')));
  IF v_candidate <> '' AND v_candidate LIKE v_prefix || '%' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.resources r WHERE r.resource_code = v_candidate
    ) INTO v_taken;

    IF NOT v_taken THEN
      RETURN v_candidate;
    END IF;
  END IF;

  -- 2. Highest numeric suffix anywhere in the prefix family. The CASE fixes
  --    evaluation order, so a non-numeric tail can never reach the cast.
  SELECT COALESCE(
           MAX(
             CASE
               WHEN substring(r.resource_code FROM v_prefix_len + 1) ~ '^[0-9]{1,15}$'
                 THEN (substring(r.resource_code FROM v_prefix_len + 1))::bigint
             END
           ),
           0
         )
    INTO v_max
    FROM public.resources r
   WHERE r.resource_code LIKE v_prefix || '%';

  v_next := v_max + 1;

  -- 3. Defensive: step past anything that somehow still occupies the slot
  --    (e.g. a hand-entered code with leading zeros stripped).
  LOOP
    v_code := v_prefix || lpad(v_next::text, 4, '0');

    SELECT EXISTS (
      SELECT 1 FROM public.resources r WHERE r.resource_code = v_code
    ) INTO v_taken;

    EXIT WHEN NOT v_taken;

    v_next  := v_next + 1;
    v_guard := v_guard + 1;
    IF v_guard > 100 THEN
      RAISE EXCEPTION
        'fn_allocate_resource_code: no free suffix for % after 100 probes', v_prefix
        USING ERRCODE = '55000';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$$;

COMMENT ON FUNCTION public.fn_allocate_resource_code(text, text) IS
  'Allocate the next free resources.resource_code for a RES-<CAT>-<INST>- prefix family, scanning the WHOLE family without RLS narrowing. Exists because all eleven JKKN-family institutions compress to the same 4-char institution code and therefore share one suffix space, while the caller''s own SELECT is narrowed to their institution — so a sibling''s code looked free, the insert hit the global unique index, and the retry recomputed the same stale value (BUG-003978). Returns a string only; inserts nothing. Serialised per prefix with a transaction-scoped advisory lock; the unique index remains the final arbiter.';

REVOKE ALL    ON FUNCTION public.fn_allocate_resource_code(text, text) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION public.fn_allocate_resource_code(text, text) TO authenticated;
