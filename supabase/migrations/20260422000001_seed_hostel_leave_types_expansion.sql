-- =====================================================================
-- Campus Living hostel leave types — expand defaults by 9 more codes
-- Date: 2026-04-22
-- Trigger: Director feedback 2026-04-21: "Leave types have to be increased,
--          max days for each leave is not fixed." The table is already
--          CRUDable (PR #287 shipped 20260421000005). This seed adds 9
--          common-Indian-academic leave types as system defaults so every
--          institution sees them out-of-box. Admins can still deactivate
--          (is_active=false) per-college via the settings UI if a type
--          doesn't fit their context.
--
-- What this migration does:
--   - INSERT 9 new (code, name, description, color, defaults, sort_order)
--     for EVERY institution.
--   - is_system=true so UI blocks delete (matching the 7 defaults seeded
--     by PR #287). Admins can still edit or deactivate.
--   - ON CONFLICT DO NOTHING — safe to re-run; safe to run before admins
--     have added any per-institution variants with the same code.
--
-- Not a schema change — pure data seed. No RLS changes. No column changes.
--
-- Design decisions (assumption-thrash category 15 + chain Q1):
--   - All 9 are added with is_system=true. Trade-off: UI can't delete them
--     ever. Rationale: these are common-enough defaults that deactivation
--     (is_active=false) is the right reversibility mechanism. A college
--     that doesn't need "Clinical Rotation" (e.g. Engineering) can just
--     deactivate it — they won't accidentally re-seed it later.
--   - Clinical Rotation defaults: 180 days max, chief_warden=true, attachment=true
--     (academic requirement, needs duty schedule from dept).
--   - Bereavement: parent_consent=true but advance_notice=0 (expedited path).
--   - Festival default_max_days=5 covers long weekends like Pongal/Diwali.
--   - Internship: 180 days max (semester), chief_warden=true, attachment=true.
--
-- Idempotency:
--   - ON CONFLICT (institution_id, leave_type_code) DO NOTHING — re-runnable.
--   - Does NOT touch rows that admins may have already created with these
--     codes (unlikely but safe).
-- =====================================================================

BEGIN;

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
        -- Festival / Public Holiday (Diwali, Pongal, Eid, Christmas, etc.)
        ('festival', 'Festival / Public Holiday',
         'National or regional holidays, religious festivals, and cultural observances',
         '#F59E0B', 5, true, false, false, 72, 80),

        -- Wedding / Family Function
        ('family_function', 'Wedding / Family Function',
         'Weddings, naming ceremonies, housewarming, and other family events requiring attendance',
         '#EC4899', 7, true, false, false, 48, 90),

        -- Bereavement / Condolence
        ('bereavement', 'Bereavement / Condolence',
         'Death in family or immediate relations; funeral and ritual observance',
         '#475569', 10, true, false, false, 0, 100),

        -- Clinical / Hospital Rotation (medical, dental, nursing, pharmacy, allied health)
        ('clinical_rotation', 'Clinical / Hospital Rotation',
         'Scheduled clinical or hospital duty for medical, dental, nursing, pharmacy, and allied health students',
         '#0EA5E9', 180, false, true, true, 168, 110),

        -- Industrial Visit / Field Trip
        ('industrial_visit', 'Industrial Visit / Field Trip',
         'Department-organized factory, industry, or site visits and academic field trips',
         '#10B981', 5, true, false, true, 96, 120),

        -- Internship / Placement
        ('internship', 'Internship / Placement',
         'Summer internships, semester placements, or industry training outside the institution',
         '#14B8A6', 180, true, true, true, 168, 130),

        -- Training / Workshop
        ('training', 'Training / Workshop',
         'External training programs, workshops, and certification courses',
         '#A855F7', 14, true, false, true, 72, 140),

        -- Sports / Cultural Event
        ('sports_cultural', 'Sports / Cultural Event',
         'Inter-college sports tournaments, cultural fests, and team travel for competitions',
         '#F43F5E', 7, true, false, true, 72, 150),

        -- Convocation / Alumni Event
        ('convocation', 'Convocation / Alumni Event',
         'Graduation ceremonies, alumni reunions, and one-off institutional events',
         '#EAB308', 3, true, false, false, 168, 160)
) AS defaults(
    code, name, description, color, default_days,
    parent_consent, chief_warden, attachment, advance_hours, sort_order
)
ON CONFLICT (institution_id, leave_type_code) DO NOTHING;

COMMIT;

-- =====================================================================
-- Post-migration verification (read-only; run in Supabase SQL Editor)
-- =====================================================================
--
-- -- 1. Check per-institution counts — expect 16 system defaults each
-- --    (7 from PR #287 + 9 from this migration = 16).
-- SELECT i.name AS institution,
--        COUNT(hlt.id) FILTER (WHERE hlt.is_system) AS system_defaults
-- FROM public.institutions i
-- LEFT JOIN public.hostel_leave_types hlt ON hlt.institution_id = i.id
-- GROUP BY i.id, i.name
-- ORDER BY i.name;
-- -- Expected: every institution shows 16 system_defaults (may differ if
-- -- admins have deactivated or added custom types).
--
-- -- 2. Verify the 9 new codes landed globally:
-- SELECT leave_type_code, COUNT(DISTINCT institution_id) AS inst_count
-- FROM public.hostel_leave_types
-- WHERE leave_type_code IN (
--     'festival','family_function','bereavement','clinical_rotation',
--     'industrial_visit','internship','training','sports_cultural','convocation'
-- )
-- GROUP BY leave_type_code
-- ORDER BY leave_type_code;
-- -- Expected: inst_count = (total institutions) for all 9 rows.
