-- =====================================================================
-- Campus Living — make hostel_leave_type_config.leave_type nullable
-- Date: 2026-04-22
-- Trigger: Today's 9-type expansion (#317) added codes — festival, family_function,
--          bereavement, clinical_rotation, industrial_visit, internship, training,
--          sports_cultural, convocation — to the CRUDable hostel_leave_types
--          master table. These codes are NOT in the legacy hostel_leave_type_enum
--          (which only has the 7 original values). The xlsx loader and future
--          UI writes need to insert rows referencing these new codes via
--          leave_type_id FK, but hostel_leave_type_config.leave_type is still
--          NOT NULL hostel_leave_type_enum from 2026-02 and PG rejects any
--          insert of a new code there.
--
-- What this does:
--   Single-line DDL: ALTER TABLE hostel_leave_type_config ALTER COLUMN
--   leave_type DROP NOT NULL. The legacy enum column stays (for backward
--   compat with existing rows); new rows can set leave_type_id FK and leave
--   the enum column NULL.
--
-- Cleanup path (future PR, not this one):
--   Once all code paths are migrated to read leave_type_id, the enum column
--   can be dropped entirely along with hostel_leave_type_enum.
--
-- Idempotency: DO block pre-checks is_nullable so re-running is safe.
-- =====================================================================

BEGIN;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'hostel_leave_type_config'
          AND column_name = 'leave_type'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE public.hostel_leave_type_config
          ALTER COLUMN leave_type DROP NOT NULL;
    END IF;
END $$;

COMMENT ON COLUMN public.hostel_leave_type_config.leave_type IS
  'DEPRECATED — legacy enum column. NULL for rows using the new leave_type_id FK '
  '(post-2026-04-22 codes like festival, clinical_rotation, etc). Enum column '
  'will be dropped after all read paths migrate to leave_type_id.';

COMMIT;

-- =====================================================================
-- Post-migration verification
-- =====================================================================
-- SELECT is_nullable FROM information_schema.columns
-- WHERE table_schema='public'
--   AND table_name='hostel_leave_type_config'
--   AND column_name='leave_type';
-- -- Expected: YES
