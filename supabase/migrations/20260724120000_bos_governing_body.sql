-- ═══════════════════════════════════════════════════════════════════════════
-- Governing Body meetings on the BoS engine
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A Governing Body (GB) is an institution-level body modelled EXACTLY like the
-- Academic Council (see 20260706b_bos_academic_council.sql): a special
-- bos_composition (is_governing_body = true, board_type = 'governing_body')
-- that has NO board — its members are the BoS chairmen (auto-snapshotted at
-- prepare time) plus the principal (auto-seated as chairman) and any manually
-- added members. Its meetings are bos_meetings rows with
-- meeting_type = 'governing_body'.
--
-- This reuses the entire downstream stack unchanged — attendance, TA/DA,
-- call-letter email, minutes, and the shorter principal-driven status machine
-- (shared with Academic Council). Only creation, authorization, and listing are
-- discriminated by the is_governing_body flag / meeting_type in code.
--
-- board_id on both bos_compositions and bos_meetings is already nullable (the
-- Academic Council migration dropped NOT NULL), so no column-widening is needed
-- here — GB reuses that.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. bos_compositions: flag ───────────────────────────────────────────────

ALTER TABLE bos_compositions
  ADD COLUMN IF NOT EXISTS is_governing_body BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_bos_compositions_is_governing_body
  ON bos_compositions(is_governing_body)
  WHERE is_governing_body = true;

-- ── 2. bos_meetings: governing_body type ────────────────────────────────────

-- meeting_type CHECK: add 'governing_body'. Re-declare the full set (matching
-- 20260706b) so this is idempotent regardless of which constraints exist.
ALTER TABLE bos_meetings
  DROP CONSTRAINT IF EXISTS bos_meetings_meeting_type_check;
ALTER TABLE bos_meetings
  ADD CONSTRAINT bos_meetings_meeting_type_check CHECK (meeting_type IN (
    'regular', 'special', 'emergency', 'online', 'hybrid', 'academic_council', 'governing_body'
  ));

-- GB meetings have no board_id, so the original UNIQUE(board_id, academic_year,
-- meeting_number) stops protecting them (Postgres treats NULLs as distinct).
-- Add a partial unique index keyed on composition_id — mirrors uq_bos_meetings_ac_number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bos_meetings_gb_number
  ON bos_meetings(composition_id, meeting_number)
  WHERE meeting_type = 'governing_body';

-- ── 3. Permission key + grant ────────────────────────────────────────────────
--
-- GB pages are gated to super-admin + principal, exactly like Academic Council.
-- The sidebar/tab link is hidden for anyone lacking this key (MENU_PERMISSIONS
-- maps /bos/governing-body to it), so principals — who are NOT super-admins —
-- MUST be granted it or the page vanishes for them. Super-admins bypass checks.
--
-- custom_roles.permissions is a JSONB OBJECT of "dot.key": true. Merge with `||`
-- (a no-op if the key already exists).

UPDATE public.custom_roles
SET permissions = permissions || '{
  "academic.bos-governing-body.manage": true
}'::jsonb
WHERE role_key = 'principal';
