-- ─────────────────────────────────────────────────────────────────────────────
-- 20260706_bos_committees_per_composition.sql
--
-- Re-parent BoS committees from institution-owned → composition-owned.
--
-- BEFORE (20260610_bos_committees.sql): bos_committees was an INSTITUTION master
-- list — committees were defined once per institution and shared by every
-- composition of that institution.
--
-- AFTER (this migration): each composition owns its OWN set of committees. Two
-- compositions in the same institution may each have a "Curriculum Development
-- Cell" with different members. Model becomes:
--
--     Composition ── has many ──▶ Committee ── has many ──▶ Member
--                                 (composition_id)          (committee_id)
--
--   1. bos_committees.composition_id — new FK (ON DELETE CASCADE: a committee
--      cannot outlive its composition). institutions_id is KEPT as a
--      denormalised RLS anchor (policies gate on role_has_institution_access).
--   2. Uniqueness swap — (institutions_id, name) → (composition_id, name), so
--      the same committee name can exist under different compositions.
--   3. Backfill — fan the shared institution committees out into per-composition
--      copies, re-point every member to its own composition's copy, and rename
--      the legacy default 'Board of Studies' → 'Curriculum Development Cell'.
--   4. Seed — ensure every composition has a 'Curriculum Development Cell'
--      committee so the Add Member dropdown is never empty.
--
-- RLS is UNCHANGED — the existing policies gate on institutions_id via
-- role_has_institution_access() and reuse the academic.bos-compositions.* keys.
-- We deliberately keep institutions_id populated so none of that has to move
-- (and so we avoid the new-permission-key grant drift that has blank-paged BoS
-- pages before — see 20260516_normalize_bos_perm_key_format_drift).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. composition_id column ─────────────────────────────────────────────────

ALTER TABLE bos_committees
  ADD COLUMN IF NOT EXISTS composition_id UUID
  REFERENCES bos_compositions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_bos_committees_composition
  ON bos_committees(composition_id);

COMMENT ON COLUMN bos_committees.composition_id IS
  'Owning composition. Each composition has its own committee set. institutions_id is kept as a denormalised RLS anchor.';

-- ── 2. Uniqueness swap: institution-scoped → composition-scoped ──────────────
-- The old institution-name/short-code unique indexes would reject a second
-- composition in the same institution having a same-named committee. Drop them
-- and re-scope to the composition. Template rows (composition_id IS NULL, e.g.
-- anything left on the old /bos/committees master page) keep institution-level
-- uniqueness via the partial indexes below.

DROP INDEX IF EXISTS uniq_bos_committees_institution_name;
DROP INDEX IF EXISTS uniq_bos_committees_institution_code;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_committees_composition_name
  ON bos_committees (composition_id, lower(name))
  WHERE composition_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_committees_composition_code
  ON bos_committees (composition_id, lower(short_code))
  WHERE composition_id IS NOT NULL AND short_code IS NOT NULL;

-- Template rows (no composition) stay unique per institution as before.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_committees_template_name
  ON bos_committees (institutions_id, lower(name))
  WHERE composition_id IS NULL;

-- ── 3. Backfill: fan shared committees out per composition ───────────────────
-- 3a. For every (composition, committee) pair currently referenced by a member,
--     materialise a composition-owned copy. The legacy default 'Board of
--     Studies' is renamed to 'Curriculum Development Cell' as it is copied.

INSERT INTO bos_committees (institutions_id, composition_id, name, short_code, sort_order, is_active, created_by)
SELECT DISTINCT
  comp.institutions_id,
  comp.id,
  CASE WHEN lower(src.name) = 'board of studies'
       THEN 'Curriculum Development Cell' ELSE src.name END,
  CASE WHEN lower(src.name) = 'board of studies'
       THEN 'CDC' ELSE src.short_code END,
  src.sort_order,
  src.is_active,
  src.created_by
FROM bos_members m
JOIN bos_compositions comp ON comp.id = m.composition_id
JOIN bos_committees  src  ON src.id  = m.committee_id
WHERE m.committee_id IS NOT NULL
  AND src.composition_id IS NULL           -- only fan out the old shared rows
  AND comp.institutions_id IS NOT NULL
-- Partial-index inference: uniq_bos_committees_composition_name is defined
-- WHERE composition_id IS NOT NULL, so the ON CONFLICT must repeat that
-- predicate (every row inserted here has a non-null composition_id).
ON CONFLICT (composition_id, lower(name)) WHERE composition_id IS NOT NULL DO NOTHING;

-- 3b. Re-point each member from the old shared committee to its own
--     composition's freshly-created copy (matched by the renamed name).

UPDATE bos_members m
SET committee_id = newc.id
FROM bos_committees oldc, bos_committees newc
WHERE m.committee_id = oldc.id
  AND oldc.composition_id IS NULL
  AND newc.composition_id = m.composition_id
  AND lower(newc.name) = lower(
        CASE WHEN lower(oldc.name) = 'board of studies'
             THEN 'Curriculum Development Cell' ELSE oldc.name END
      );

-- ── 4. Seed a 'Curriculum Development Cell' into every composition ────────────
-- Guarantees the Add Member committee dropdown is populated even for
-- compositions that had no members yet.

INSERT INTO bos_committees (institutions_id, composition_id, name, short_code, sort_order, is_active)
SELECT comp.institutions_id, comp.id, 'Curriculum Development Cell', 'CDC', 0, true
FROM bos_compositions comp
WHERE comp.institutions_id IS NOT NULL
ON CONFLICT (composition_id, lower(name)) WHERE composition_id IS NOT NULL DO NOTHING;

-- ── 5. Retire the old shared default rows (safe) ─────────────────────────────
-- The institution-level 'Board of Studies' defaults created by 20260610 are now
-- superseded by per-composition copies and no longer referenced by any member
-- (3b re-pointed them). Remove ONLY those with no remaining references so the
-- old master page doesn't show stale duplicates. Any admin-authored template
-- rows (other names) are left untouched.

DELETE FROM bos_committees oldc
WHERE oldc.composition_id IS NULL
  AND lower(oldc.name) = 'board of studies'
  AND NOT EXISTS (
    SELECT 1 FROM bos_members m WHERE m.committee_id = oldc.id
  );

COMMENT ON TABLE bos_committees IS
  'Per-composition BoS committees (Curriculum Development Cell, Exam Committee, …). Members of a composition are grouped by committee via bos_members.committee_id. composition_id owns the row; institutions_id is a denormalised RLS anchor.';
