-- =====================================================================
-- Campus Living leave types — enum → CRUDable master table
-- Date: 2026-04-21
-- Trigger: Director feedback 2026-04-21 — "can leave types and duration
--          be CRUDable?" Current `hostel_leave_type_enum` hardcodes 7
--          types, requires DDL migration to expand, can't be deactivated.
--          Mirrors the academic module's `public.leave_types` pattern
--          (migration 20251216_create_leave_management_tables.sql).
--
-- What this migration does:
--
--   PHASE 1: CREATE TABLE hostel_leave_types — institution-scoped master
--            table (leave_type_code, leave_type_name, description,
--            color_code, default flags, is_system, is_active, sort_order).
--            Unique constraint on (institution_id, leave_type_code).
--
--   PHASE 2: Seed 7 default types × every existing institution → one row
--            per (institution, type). is_system=true for seeded rows
--            (service enforces no-delete for system rows).
--
--   PHASE 3: Add nullable `leave_type_id UUID FK` to hostel_leave_type_config
--            and hostel_leave_requests. Backfill from existing enum column
--            via JOIN on (institution_id, leave_type_code).
--
--   PHASE 4: RLS on hostel_leave_types — 4 CRUD policies with standard
--            CLAUDE.md pattern using new permission keys
--            campus_living.leave_types.{view,create,edit,delete}.
--
-- What this migration DOES NOT do (deferred to cleanup PR):
--
--   - Drop `leave_type` enum column from hostel_leave_type_config /
--     hostel_leave_requests. Both columns stay during transition so
--     existing code paths keep compiling. A follow-up PR swaps code
--     to use leave_type_id, then drops the enum column + enum type.
--
-- Atomicity: single BEGIN/COMMIT — all-or-nothing.
-- Idempotency: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING, DO
--              block pre-checks for column existence, DROP POLICY IF
--              EXISTS.
-- Rollback: drop policies, drop 2 FK columns, drop table. Existing enum
--           column on both tables preserved — no data loss.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PHASE 1: Create hostel_leave_types master table
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hostel_leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    leave_type_code VARCHAR(30) NOT NULL,
    leave_type_name VARCHAR(100) NOT NULL,
    description TEXT,
    color_code VARCHAR(7) NOT NULL DEFAULT '#6B7280',
    default_max_duration_days INT,
    requires_parent_consent BOOLEAN NOT NULL DEFAULT true,
    requires_chief_warden BOOLEAN NOT NULL DEFAULT false,
    requires_attachment BOOLEAN NOT NULL DEFAULT false,
    advance_notice_hours INT,
    sort_order INT NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hostel_leave_type_code_per_institution
        UNIQUE (institution_id, leave_type_code),
    CONSTRAINT chk_color_code_hex
        CHECK (color_code ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT chk_default_max_duration_positive
        CHECK (default_max_duration_days IS NULL OR default_max_duration_days > 0),
    CONSTRAINT chk_advance_notice_non_negative
        CHECK (advance_notice_hours IS NULL OR advance_notice_hours >= 0)
);

COMMENT ON TABLE public.hostel_leave_types IS
  'CRUDable master of hostel leave type categories. Per-institution — '
  'each college owns its list. Replaces the hardcoded hostel_leave_type_enum '
  'from 2026-02 which required a DDL migration to expand. is_system=true '
  'rows are the seeded defaults (7 per institution) — the service layer '
  'blocks delete on is_system rows so defaults can''t be wiped.';

COMMENT ON COLUMN public.hostel_leave_types.leave_type_code IS
  'Machine-readable code (uppercase letters, digits, underscores). Unique '
  'per institution. Used by config + request rows via leave_type_id FK.';

COMMENT ON COLUMN public.hostel_leave_types.default_max_duration_days IS
  'Default max days per request for this type. NULL = no cap. Can be '
  'overridden per-college in hostel_leave_type_config.max_duration_days.';

COMMENT ON COLUMN public.hostel_leave_types.is_system IS
  'TRUE for the 7 seeded defaults. UI must disable the delete action for '
  'system rows; service throws on delete attempt.';

CREATE INDEX IF NOT EXISTS hostel_leave_types_institution_idx
  ON public.hostel_leave_types (institution_id);

CREATE INDEX IF NOT EXISTS hostel_leave_types_active_idx
  ON public.hostel_leave_types (is_active);

ALTER TABLE public.hostel_leave_types ENABLE ROW LEVEL SECURITY;

-- updated_at trigger (uses existing Campus Living convention —
-- update_updated_at_column + trg_<table>_updated_at)
DROP TRIGGER IF EXISTS trg_hostel_leave_types_updated_at
  ON public.hostel_leave_types;
CREATE TRIGGER trg_hostel_leave_types_updated_at
  BEFORE UPDATE ON public.hostel_leave_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- PHASE 2: Seed 7 defaults × every institution
-- ---------------------------------------------------------------------

INSERT INTO public.hostel_leave_types (
    institution_id, leave_type_code, leave_type_name, description,
    color_code, default_max_duration_days, requires_parent_consent,
    requires_chief_warden, requires_attachment, advance_notice_hours,
    sort_order, is_system, is_active
)
SELECT
    i.id AS institution_id,
    defaults.code,
    defaults.name,
    defaults.description,
    defaults.color,
    defaults.default_days,
    defaults.parent_consent,
    defaults.chief_warden,
    defaults.attachment,
    defaults.advance_hours,
    defaults.sort_order,
    true AS is_system,
    true AS is_active
FROM public.institutions i
CROSS JOIN (
    VALUES
        ('home_visit', 'Home Visit',
         'Visit to home / guardian — overnight stays outside hostel',
         '#3B82F6', 30, true, false, false, 24, 10),
        ('weekend', 'Weekend Out',
         'Day/overnight leave falling on weekend',
         '#22C55E', 2, true, false, false, 12, 20),
        ('vacation', 'Vacation',
         'Extended holiday during semester breaks',
         '#F97316', 45, true, false, false, 72, 30),
        ('emergency', 'Emergency',
         'Unplanned urgent leave — family crisis, accident, etc.',
         '#EF4444', 7, true, true, false, 0, 40),
        ('medical', 'Medical',
         'Leave for medical treatment or recovery — attachment required',
         '#DC2626', 15, true, false, true, 0, 50),
        ('academic', 'Academic',
         'Exam, conference, paper presentation, industrial visit',
         '#8B5CF6', 10, true, false, false, 48, 60),
        ('night_out', 'Night Out',
         'Single-night overnight leave within city',
         '#6366F1', 1, true, false, false, 6, 70)
) AS defaults(
    code, name, description, color, default_days,
    parent_consent, chief_warden, attachment, advance_hours, sort_order
)
ON CONFLICT (institution_id, leave_type_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- PHASE 3: Add leave_type_id FK to config + requests (nullable, backfill)
-- ---------------------------------------------------------------------

-- 3a: hostel_leave_type_config.leave_type_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'hostel_leave_type_config'
          AND column_name = 'leave_type_id'
    ) THEN
        ALTER TABLE public.hostel_leave_type_config
          ADD COLUMN leave_type_id UUID REFERENCES public.hostel_leave_types(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- Backfill hostel_leave_type_config.leave_type_id from the enum column.
-- The cast-to-text works because PG enums are cast-compatible with text.
UPDATE public.hostel_leave_type_config cfg
SET leave_type_id = hlt.id
FROM public.hostel_leave_types hlt
WHERE cfg.leave_type_id IS NULL
  AND cfg.institution_id = hlt.institution_id
  AND cfg.leave_type::text = hlt.leave_type_code;

CREATE INDEX IF NOT EXISTS hostel_leave_type_config_leave_type_id_idx
  ON public.hostel_leave_type_config (leave_type_id);

-- 3b: hostel_leave_requests.leave_type_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'hostel_leave_requests'
          AND column_name = 'leave_type_id'
    ) THEN
        ALTER TABLE public.hostel_leave_requests
          ADD COLUMN leave_type_id UUID REFERENCES public.hostel_leave_types(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- hostel_leave_requests stores institution via join on block → for the
-- backfill we JOIN through hostel_blocks to get the learner's institution.
-- PG rule: JOIN ON clauses in UPDATE...FROM cannot reference the UPDATE
-- target. The `req.leave_type_code` condition must live in WHERE, not
-- in the JOIN ON clause. (Fixed 2026-04-22 during prod apply — original
-- version crashed with "invalid reference to FROM-clause entry for
-- table 'req'".)
UPDATE public.hostel_leave_requests req
SET leave_type_id = hlt.id
FROM public.hostel_blocks blk
JOIN public.hostel_leave_types hlt
  ON hlt.institution_id = blk.institution_id
WHERE req.leave_type_id IS NULL
  AND req.block_id = blk.id
  AND hlt.leave_type_code = req.leave_type::text;

-- For leave requests on SHARED blocks (institution_id NULL after PR-1
-- #282), fall back to any matching type code regardless of institution.
-- Best-effort — warden can update manually later if wrong.
-- Fallback uses a scalar subquery (SELECT ... LIMIT 1) instead of IN(...)
-- because PG doesn't allow outer-table references inside a grouped
-- subquery. Deterministic pick: oldest created_at, then smallest id.
-- (Fixed 2026-04-22 same commit as the JOIN-ON fix above.)
UPDATE public.hostel_leave_requests req
SET leave_type_id = (
    SELECT hlt.id
    FROM public.hostel_leave_types hlt
    WHERE hlt.leave_type_code = req.leave_type::text
    ORDER BY hlt.created_at ASC, hlt.id ASC
    LIMIT 1
)
WHERE req.leave_type_id IS NULL
  AND EXISTS (
      SELECT 1 FROM public.hostel_leave_types hlt2
      WHERE hlt2.leave_type_code = req.leave_type::text
  );

CREATE INDEX IF NOT EXISTS hostel_leave_requests_leave_type_id_idx
  ON public.hostel_leave_requests (leave_type_id);

-- ---------------------------------------------------------------------
-- PHASE 4: RLS policies (standard CLAUDE.md pattern)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS hostel_leave_types_select_permission
  ON public.hostel_leave_types;
CREATE POLICY hostel_leave_types_select_permission
  ON public.hostel_leave_types FOR SELECT
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.leave_types.view')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_leave_types_insert_permission
  ON public.hostel_leave_types;
CREATE POLICY hostel_leave_types_insert_permission
  ON public.hostel_leave_types FOR INSERT
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.leave_types.create')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_leave_types_update_permission
  ON public.hostel_leave_types;
CREATE POLICY hostel_leave_types_update_permission
  ON public.hostel_leave_types FOR UPDATE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.leave_types.edit')
          AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.leave_types.edit')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_leave_types_delete_permission
  ON public.hostel_leave_types;
CREATE POLICY hostel_leave_types_delete_permission
  ON public.hostel_leave_types FOR DELETE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.leave_types.delete')
          AND role_has_institution_access(institution_id)
          AND NOT is_system)
  );

COMMIT;

-- =====================================================================
-- Post-migration verification (run in Supabase SQL Editor)
-- =====================================================================
--
-- -- 1. Seed populated for all institutions:
-- SELECT i.name AS institution,
--        COUNT(hlt.id) AS type_count
-- FROM public.institutions i
-- LEFT JOIN public.hostel_leave_types hlt ON hlt.institution_id = i.id
-- GROUP BY i.id, i.name
-- ORDER BY i.name;
-- -- Expected: 7 rows per institution (home_visit, weekend, vacation,
-- --           emergency, medical, academic, night_out)
--
-- -- 2. hostel_leave_type_config backfill:
-- SELECT COUNT(*) FILTER (WHERE leave_type_id IS NOT NULL) AS filled,
--        COUNT(*) FILTER (WHERE leave_type_id IS NULL) AS nulls
-- FROM public.hostel_leave_type_config;
-- -- Expected: nulls = 0 (every existing config row got a leave_type_id)
--
-- -- 3. hostel_leave_requests backfill:
-- SELECT COUNT(*) FILTER (WHERE leave_type_id IS NOT NULL) AS filled,
--        COUNT(*) FILTER (WHERE leave_type_id IS NULL) AS nulls
-- FROM public.hostel_leave_requests;
-- -- Expected: nulls = 0 (best-effort for shared-block requests)
--
-- -- 4. RLS policies:
-- SELECT policyname, cmd, qual IS NOT NULL AS has_qual
-- FROM pg_policies
-- WHERE tablename = 'hostel_leave_types';
-- -- Expected: 4 rows, all *_permission named.
