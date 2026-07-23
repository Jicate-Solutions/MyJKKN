-- ═══════════════════════════════════════════════════════════════════════════
-- Academic Council meetings on the BoS engine
-- ═══════════════════════════════════════════════════════════════════════════
--
-- An Academic Council (AC) is the institution-level body that RATIFIES what the
-- subject-level Boards of Studies recommend. We model it as a *special
-- bos_composition* (is_academic_council = true, board_type = 'academic_council')
-- that has NO board — its members are the BoS chairmen (auto-snapshotted at
-- create time) plus principal-added members. Its meetings are bos_meetings rows
-- with meeting_type = 'academic_council'.
--
-- This lets AC reuse the entire downstream stack unchanged — attendance, TA/DA,
-- call-letter email, and minutes all resolve from composition_id → bos_members.
-- Only creation, authorization, and the status machine differ (handled in code).
--
-- Two schema realities this migration must respect:
--   • The live institution column is `institutions_id` (plural) — the original
--     CREATE said `institution_id` but 20260424 renamed it. ALTER the plural.
--   • bos_compositions.board_id and bos_meetings.board_id are NOT NULL today;
--     an AC body/meeting has no board, so we drop NOT NULL. This is a widening
--     change — every existing row already has a value, so nothing breaks.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. bos_compositions: flag + board-less support ──────────────────────────

ALTER TABLE bos_compositions
  ADD COLUMN IF NOT EXISTS is_academic_council BOOLEAN NOT NULL DEFAULT false;

-- AC bodies carry no board_id. Existing BoS compositions all have one, so
-- dropping NOT NULL widens the column without touching any current row.
ALTER TABLE bos_compositions
  ALTER COLUMN board_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bos_compositions_is_academic_council
  ON bos_compositions(is_academic_council)
  WHERE is_academic_council = true;

-- ── 2. bos_meetings: academic_council type + board-less support ──────────────

-- meeting_type CHECK: add 'academic_council'. (An earlier migration
-- 20260512000001 already added 'hybrid'; re-declare the full set so this is
-- idempotent regardless of which constraints exist.)
ALTER TABLE bos_meetings
  DROP CONSTRAINT IF EXISTS bos_meetings_meeting_type_check;
ALTER TABLE bos_meetings
  ADD CONSTRAINT bos_meetings_meeting_type_check CHECK (meeting_type IN (
    'regular', 'special', 'emergency', 'online', 'hybrid', 'academic_council'
  ));

-- AC meetings have no board. Drop NOT NULL (widening — all existing rows keep
-- their value).
ALTER TABLE bos_meetings
  ALTER COLUMN board_id DROP NOT NULL;

-- The original UNIQUE(board_id, academic_year, meeting_number) stops protecting
-- AC meetings once board_id is NULL (Postgres treats NULLs as distinct). Add a
-- partial unique index keyed on composition_id so AC meeting numbers stay unique
-- within their body. BoS meetings continue to rely on the original constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bos_meetings_ac_number
  ON bos_meetings(composition_id, meeting_number)
  WHERE meeting_type = 'academic_council';

-- ── 3. Permission key + grant ────────────────────────────────────────────────
--
-- AC pages are gated to super-admin + principal. The sidebar link is hidden for
-- anyone lacking this key (MENU_PERMISSIONS maps /bos/academic-council to it),
-- so principals — who are NOT super-admins — MUST be granted it or the page
-- vanishes for them.
--
-- custom_roles.permissions is a JSONB OBJECT of "dot.key": true (see the
-- 20260512 grant migration), NOT an array. Merge the key in with `||`, which
-- is a no-op if the key already exists. Super-admins bypass permission checks.

UPDATE public.custom_roles
SET permissions = permissions || '{
  "academic.bos-academic-council.manage": true
}'::jsonb
WHERE role_key = 'principal';
