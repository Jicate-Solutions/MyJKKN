-- ─────────────────────────────────────────────────────────────────────────────
-- 20260611_bos_member_types.sql
--
-- Institution-wise BoS Member Types (mirrors 20260610_bos_committees.sql).
--
-- The Add Member dialog's "Member Type" dropdown was a hardcoded 10-value
-- enum. This makes it data-driven per institution: institutions maintain
-- their own member types (name, order, status) on /bos/member-types, and
-- bos_members rows link to them via member_type_id.
--
-- The legacy bos_members.member_type enum column is KEPT — it is load-bearing:
--   • member_type='chairman' drives composition authorization
--     (resolveBosBoardScope.isChairmanIn / guardCompositionChairman)
--   • external types (university_nominee, subject_expert, industry_expert,
--     alumni, startup) switch the Add Member dialog to the expert picker
--   • TA/DA auto-claims read it
-- Each bos_member_types row therefore carries base_type — which legacy enum
-- value rows of this type behave as. The UI writes member_type = base_type
-- alongside member_type_id.
--
--   1. bos_member_types            — new master table
--   2. bos_members.member_type_id  — nullable FK
--   3. Seed                        — the 10 legacy types per institution that
--                                    has compositions, ordered as the detail
--                                    page displayed them
--   4. Backfill                    — existing members linked by base_type
--
-- RLS reuses `academic.bos-compositions.*` keys — same rationale as the
-- committees migration (avoid new-key grant drift).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. bos_member_types ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bos_member_types (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  -- Legacy behaviour key. Decides chairman rights, staff-vs-expert picker,
  -- and TA/DA treatment for members of this type.
  base_type       VARCHAR(50) NOT NULL DEFAULT 'internal_member' CHECK (base_type IN (
    'principal', 'chairman', 'hod', 'facilitator', 'university_nominee',
    'subject_expert', 'internal_member', 'industry_expert', 'alumni', 'startup'
  )),
  sort_order      INTEGER NOT NULL DEFAULT 0,    -- display order within the institution
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bos_member_types_institution ON bos_member_types(institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_member_types_is_active   ON bos_member_types(is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_member_types_institution_name
  ON bos_member_types (institutions_id, lower(name));

ALTER TABLE bos_member_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_member_types_select" ON bos_member_types FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.view')
      AND role_has_institution_access(institutions_id))
);
CREATE POLICY "bos_member_types_insert" ON bos_member_types FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id))
);
CREATE POLICY "bos_member_types_update" ON bos_member_types FOR UPDATE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id))
);
CREATE POLICY "bos_member_types_delete" ON bos_member_types FOR DELETE USING (
  is_super_admin() OR is_admin()
  OR (user_has_permission('academic.bos-compositions.edit')
      AND role_has_institution_access(institutions_id))
);

CREATE TRIGGER update_bos_member_types_updated_at
  BEFORE UPDATE ON bos_member_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bos_member_types IS
  'Institution-wise BoS member types (Chairman, Subject Expert, …). Drives the Add Member dialog; base_type maps each row to the legacy bos_members.member_type behaviour.';

-- ── 2. bos_members.member_type_id ────────────────────────────────────────────

ALTER TABLE bos_members
  ADD COLUMN IF NOT EXISTS member_type_id UUID REFERENCES bos_member_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bos_members_member_type_id ON bos_members(member_type_id);

COMMENT ON COLUMN bos_members.member_type_id IS
  'FK to bos_member_types. The legacy member_type column stays as the behaviour key (= the type''s base_type at insert time).';

-- ── 3. Seed: the 10 legacy types per institution with compositions ───────────
-- Order matches the detail page's historical display order. Names match
-- BOS_MEMBER_TYPE_LABELS in types/bos.ts.

INSERT INTO bos_member_types (institutions_id, name, base_type, sort_order)
SELECT c.institutions_id, t.name, t.base_type, t.sort_order
FROM (SELECT DISTINCT institutions_id FROM bos_compositions WHERE institutions_id IS NOT NULL) c
CROSS JOIN (VALUES
  ('Principal',          'principal',          1),
  ('Chairman',           'chairman',           2),
  ('Head of Department', 'hod',                3),
  ('Facilitator',        'facilitator',        4),
  ('University Nominee', 'university_nominee', 5),
  ('Subject Expert',     'subject_expert',     6),
  ('Member',             'internal_member',    7),
  ('Industry Expert',    'industry_expert',    8),
  ('Alumni',             'alumni',             9),
  ('Startup',            'startup',            10)
) AS t(name, base_type, sort_order)
ON CONFLICT (institutions_id, lower(name)) DO NOTHING;

-- ── 4. Backfill: link existing members by base_type ──────────────────────────

UPDATE bos_members m
SET member_type_id = mt.id
FROM bos_compositions comp
JOIN bos_member_types mt
  ON mt.institutions_id = comp.institutions_id
WHERE m.composition_id = comp.id
  AND mt.base_type = m.member_type
  AND m.member_type_id IS NULL;
