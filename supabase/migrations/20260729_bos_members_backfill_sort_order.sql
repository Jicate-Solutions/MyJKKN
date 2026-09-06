-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260729_bos_members_backfill_sort_order.sql
--
-- Purpose
--   Persist each composition's ROSTER ORDER into bos_members.sort_order.
--
-- Background
--   sort_order (integer, default 0) has always been the roster's display rank —
--   POST /api/bos/members auto-assigns count+1, and the meeting-notice paths
--   (notify-members, preview-pdf) already ORDER BY sort_order. But all three
--   Add Member dialogs sent a literal `sort_order: 0`, and the route's
--   `body.sort_order ?? (count + 1)` kept it because 0 is not nullish. Result:
--   411 of 413 rows sat at 0 (the other 2 are the deliberate -1 chairman /
--   member-secretary float from the Academic Council / Governing Body prepare
--   routes), so the rank shown on the roster was a render-time array index that
--   existed nowhere in the database.
--
--   The dialogs no longer send 0, so NEW members append correctly. This
--   migration fixes the EXISTING rows.
--
-- Ordering
--   Replicates buildRoster() in
--   app/(routes)/bos/compositions/[compositionId]/page.tsx exactly, so nothing
--   moves on screen when it runs — the numbers simply become real:
--
--     1. Committee, by bos_committees.sort_order then name.
--        Members with no committee (or a deleted one) form the virtual
--        "General" section, which renders LAST.
--     2. Within a committee: catalog member types first (bos_member_types
--        .sort_order, then name — CAS duplicate type rows share a name and so
--        land adjacent, matching the UI's fold-by-name), then the legacy enum
--        groups in their hardcoded display order, then "Other Members".
--     3. Within a group: existing sort_order, then display_name.
--
--   The -1 AC/GB float is preserved implicitly: those rows already sort first
--   inside their group, so they keep rank 1.
--
-- Safety
--   Idempotent — only rows whose rank actually changes are written, so a
--   re-run after any manual reorder is a no-op. Ranks are 1-based, leaving 0
--   to mean "never ordered".
-- ─────────────────────────────────────────────────────────────────────────────

WITH ordered AS (
  SELECT
    m.id,
    ROW_NUMBER() OVER (
      PARTITION BY m.composition_id
      ORDER BY
        -- 1. Committee section. "General" (no committee / dangling FK) last.
        CASE WHEN c.id IS NULL THEN 1 ELSE 0 END,
        c.sort_order NULLS LAST,
        c.name        NULLS LAST,
        -- 2. Member-type group. Catalog-driven types first, then legacy enum.
        CASE WHEN t.id IS NULL THEN 1 ELSE 0 END,
        t.sort_order  NULLS LAST,
        lower(btrim(t.name)) NULLS LAST,
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
        END,
        -- 3. Within the group.
        m.sort_order,
        m.display_name
    ) AS rank
  FROM bos_members m
  LEFT JOIN bos_committees   c ON c.id = m.committee_id
  LEFT JOIN bos_member_types t ON t.id = m.member_type_id
)
UPDATE bos_members AS b
SET sort_order = o.rank,
    updated_at = now()
FROM ordered AS o
WHERE b.id = o.id
  AND b.sort_order IS DISTINCT FROM o.rank;
