-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260729_bos_renumber_member_order.sql
--
-- Purpose
--   1. Add bos_members.group_position — the number shown on each member card
--      (1, 2, 3, 4 within "Faculty Members"; 1 within "Chairman"), persisted
--      instead of being a render-time array index.
--   2. bos_renumber_member_order(composition_id) — recompute BOTH ranks for one
--      composition in a single pass.
--
-- The two ranks answer different questions
--   sort_order      — position in the WHOLE composition (1..n). This is what
--                     the meeting notice, minutes and attendance sheet order by
--                     (`.order('sort_order')`), so it must be contiguous across
--                     every committee and group.
--   group_position  — position INSIDE its member-type group within its
--                     committee (restarts at 1 for each group). This is the
--                     serial number a report prints per category, and the
--                     number the roster card shows.
--
-- Why a function, called after every insert / delete
--   POST /api/bos/members appends a new member at `count + 1`. That is correct
--   relative to its OWN group (a high number sorts last inside the group) but
--   wrong for the composition-wide rank: a faculty member added to a 14-member
--   board got rank 15 and printed at the very END of the notice instead of
--   after the other faculty members. Deleting a member likewise left a hole
--   (…7, 9, 10…). Renumbering after each write keeps the stored order equal to
--   the displayed order at all times.
--
-- Ordering
--   Identical to 20260729_bos_members_backfill_sort_order.sql, which replicates
--   buildRoster() in the composition detail page:
--     committee (sort_order, name; "General" last)
--       → catalog member types (bos_member_types.sort_order, name)
--       → legacy enum groups in display order
--       → "Other Members"
--         → existing sort_order, then display_name
--
--   Because the innermost key is the row's CURRENT sort_order, a manual
--   arrangement made with the ↑/↓ arrows survives renumbering — the function
--   only closes gaps and pulls newly appended rows into their group. It is
--   idempotent: a second run changes nothing.
--
--   Groups are keyed by member-type NAME (lowercased), not id, so the CAS
--   duplicate type rows — the same type seeded under both sibling institution
--   UUIDs — fold into one group exactly as the UI folds them.
--
-- Security
--   SECURITY DEFINER so it can rewrite rows the caller's RLS may not cover
--   (a principal managing a council roster holds no bos_members grant).
--   EXECUTE is service_role ONLY — every caller is an API route that has
--   already passed guardRosterWrite().
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Column ────────────────────────────────────────────────────────────────
ALTER TABLE bos_members
  ADD COLUMN IF NOT EXISTS group_position integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN bos_members.group_position IS
  'Serial number of this member WITHIN its member-type group in its committee '
  '(restarts at 1 per group) — the number shown on the roster card and printed '
  'as the per-category S.No. Maintained by bos_renumber_member_order(); '
  'sort_order is the composition-wide rank used for flat ordering.';

COMMENT ON COLUMN bos_members.sort_order IS
  'Display rank across the WHOLE composition (1..n, contiguous). Meeting '
  'notices, minutes and attendance sheets ORDER BY this. Maintained by '
  'bos_renumber_member_order(); 0 means never ordered.';

-- ── 2. Function ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bos_renumber_member_order(p_composition_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_composition_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH base AS (
    SELECT
      m.id,
      m.sort_order,
      m.group_position,
      m.display_name,
      -- Committee section key. "General" (no committee / dangling FK) last.
      CASE WHEN c.id IS NULL THEN 1 ELSE 0 END          AS committee_last,
      c.sort_order                                       AS committee_rank,
      c.name                                             AS committee_name,
      coalesce(c.id::text, 'general')                    AS committee_key,
      -- Member-type group: catalog types first, then legacy enum.
      CASE WHEN t.id IS NULL THEN 1 ELSE 0 END           AS legacy_group,
      t.sort_order                                       AS type_rank,
      lower(btrim(t.name))                               AS type_name,
      CASE m.member_type
        WHEN 'principal'          THEN 1
        WHEN 'chairman'           THEN 2
        WHEN 'hod'                THEN 3
        WHEN 'facilitator'        THEN 4
        WHEN 'university_nominee' THEN 5
        WHEN 'subject_expert'     THEN 6
        WHEN 'internal_member'    THEN 7
        WHEN 'industry_expert'    THEN 8
        WHEN 'alumni'             THEN 9
        WHEN 'startup'            THEN 10
        ELSE 99                   -- "Other Members"
      END                                                AS legacy_rank,
      -- Fold CAS duplicate type rows together by name, like the UI does.
      coalesce(lower(btrim(t.name)), 'legacy:' || m.member_type) AS group_key
    FROM bos_members m
    LEFT JOIN bos_committees   c ON c.id = m.committee_id
    LEFT JOIN bos_member_types t ON t.id = m.member_type_id
    WHERE m.composition_id = p_composition_id
  ),
  ordered AS (
    SELECT
      id,
      sort_order     AS old_sort_order,
      group_position AS old_group_position,
      ROW_NUMBER() OVER (
        ORDER BY committee_last, committee_rank NULLS LAST, committee_name NULLS LAST,
                 legacy_group, type_rank NULLS LAST, type_name NULLS LAST, legacy_rank,
                 sort_order, display_name
      ) AS new_sort_order,
      ROW_NUMBER() OVER (
        PARTITION BY committee_key, group_key
        ORDER BY sort_order, display_name
      ) AS new_group_position
    FROM base
  ),
  upd AS (
    UPDATE bos_members AS b
    SET sort_order     = o.new_sort_order,
        group_position = o.new_group_position,
        updated_at     = now()
    FROM ordered AS o
    WHERE b.id = o.id
      AND (b.sort_order     IS DISTINCT FROM o.new_sort_order
        OR b.group_position IS DISTINCT FROM o.new_group_position)
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.bos_renumber_member_order(uuid) IS
  'Recomputes bos_members.sort_order (composition-wide 1..n) and '
  'group_position (1..n within each member-type group of each committee) in '
  'roster order for one composition. Called by the BoS member API after '
  'insert/delete so the stored ranks always match the displayed order. '
  'Idempotent; preserves manual up/down arrangements.';

-- REVOKE ... FROM PUBLIC alone is NOT enough on Supabase: the project ships
-- default privileges that grant EXECUTE on public-schema functions directly to
-- `anon` and `authenticated`, and a direct grant is not covered by the PUBLIC
-- revoke. Both roles must be revoked explicitly, or any signed-in user could
-- renumber a roster they have no part in.
REVOKE ALL ON FUNCTION public.bos_renumber_member_order(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bos_renumber_member_order(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.bos_renumber_member_order(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bos_renumber_member_order(uuid) TO service_role;

-- ── 3. Backfill every existing composition ───────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT composition_id FROM bos_members WHERE composition_id IS NOT NULL
  LOOP
    PERFORM public.bos_renumber_member_order(r.composition_id);
  END LOOP;
END;
$$;
