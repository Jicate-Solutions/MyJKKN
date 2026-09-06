-- ─────────────────────────────────────────────────────────────────────────────
-- 20260610_bos_committees.sql
--
-- Institution-wise BoS Committees.
--
-- Model: a BoS composition (a board's 3-year constitution) can contain several
-- committees (Academic Committee, Exam Committee, …), each with its own member
-- roster. Committees are defined per institution on the new /bos/committees
-- page; members are then attached to a committee when added to a composition.
--
--   1. bos_committees             — new master table (institutions_id, name,
--                                   short_code, is_active)
--   2. bos_members.committee_id   — nullable FK; which committee within the
--                                   composition the member sits on
--   3. Duplicate-person indexes   — re-scoped from per-composition to
--                                   per-(composition, committee) so the same
--                                   person CAN serve on two different
--                                   committees of the same composition
--   4. Backfill                   — a default 'Board of Studies' committee per
--                                   institution; all existing members assigned
--                                   to it
--
-- RLS deliberately reuses the existing `academic.bos-compositions.*` permission
-- keys (NOT new `bos-committees.*` keys). New keys would need to be granted to
-- every role before the page renders — the exact format/grant drift that has
-- caused blank-page bugs before (see 20260516_normalize_bos_perm_key_format_drift).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. bos_committees ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bos_committees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  short_code      VARCHAR(50),
  sort_order      INTEGER NOT NULL DEFAULT 0,    -- display order within the institution
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bos_committees_institution ON bos_committees(institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_committees_is_active   ON bos_committees(is_active);

-- Name unique per institution (case-insensitive). Short code likewise, but
-- only when provided.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_committees_institution_name
  ON bos_committees (institutions_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_committees_institution_code
  ON bos_committees (institutions_id, lower(short_code))
  WHERE short_code IS NOT NULL;

ALTER TABLE bos_committees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_committees_select" ON bos_committees FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.view')
      AND role_has_institution_access(institutions_id))
);
CREATE POLICY "bos_committees_insert" ON bos_committees FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id))
);
CREATE POLICY "bos_committees_update" ON bos_committees FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id))
);
CREATE POLICY "bos_committees_delete" ON bos_committees FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id))
);

CREATE TRIGGER update_bos_committees_updated_at
  BEFORE UPDATE ON bos_committees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bos_committees IS
  'Institution-wise BoS committees (Academic, Exam, …). Members of a composition are grouped by committee via bos_members.committee_id.';

-- ── 2. bos_members.committee_id ──────────────────────────────────────────────

ALTER TABLE bos_members
  ADD COLUMN IF NOT EXISTS committee_id UUID REFERENCES bos_committees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bos_members_committee ON bos_members(committee_id);

COMMENT ON COLUMN bos_members.committee_id IS
  'Which committee (within the composition) this member sits on. NULL = general / pre-committee rows.';

-- ── 3. Re-scope duplicate-person uniqueness to per-committee ─────────────────
-- The 20260516 indexes blocked the same person from appearing twice in a
-- composition. With committees, the same person may sit on two DIFFERENT
-- committees of one composition — but still never twice on the same committee.
-- COALESCE folds NULL committee_id rows into one bucket so legacy/general rows
-- keep the original per-composition guarantee.

DROP INDEX IF EXISTS uniq_bos_members_composition_staff;
DROP INDEX IF EXISTS uniq_bos_members_composition_expert;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_members_comp_committee_staff
  ON bos_members (composition_id, COALESCE(committee_id, '00000000-0000-0000-0000-000000000000'::uuid), staff_id)
  WHERE staff_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_members_comp_committee_expert
  ON bos_members (composition_id, COALESCE(committee_id, '00000000-0000-0000-0000-000000000000'::uuid), expert_id)
  WHERE expert_id IS NOT NULL;

COMMENT ON INDEX uniq_bos_members_comp_committee_staff IS
  'Prevents adding the same staff member to the same committee of a composition twice (NULL committee = one shared bucket).';
COMMENT ON INDEX uniq_bos_members_comp_committee_expert IS
  'Prevents adding the same external expert to the same committee of a composition twice (NULL committee = one shared bucket).';

-- ── 4. Backfill: default committee per institution + assign existing rows ────
-- Every institution that already has a composition gets a default
-- 'Board of Studies' committee, and all existing members are assigned to it
-- so nothing renders as "no committee" after deploy.

INSERT INTO bos_committees (institutions_id, name, short_code)
SELECT DISTINCT c.institutions_id, 'Board of Studies', 'BOS'
FROM bos_compositions c
WHERE c.institutions_id IS NOT NULL
ON CONFLICT (institutions_id, lower(name)) DO NOTHING;

UPDATE bos_members m
SET committee_id = cm.id
FROM bos_compositions comp
JOIN bos_committees cm
  ON cm.institutions_id = comp.institutions_id
 AND lower(cm.name) = 'board of studies'
WHERE m.composition_id = comp.id
  AND m.committee_id IS NULL;
