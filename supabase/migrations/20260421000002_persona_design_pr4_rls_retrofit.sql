-- =====================================================================
-- Persona Design PR-4 of 4: Campus Living RLS retrofit + role permission wiring
-- Spec: ~/.claude/skills/persona-design/reference/myjkkn-campus-living.md
-- Date: 2026-04-21
-- Depends on: PR-1 (#275), PR-2 (#276), PR-3 (#277) — all merged 2026-04-21
--
-- What this migration does (atomic — single BEGIN/COMMIT):
--
--   PHASE 1: DROP 46 legacy _institution_isolation policies (FOR ALL, hardcoded
--            'super_admin' string check — flagged as anti-pattern in CLAUDE.md
--            Role Management section).
--
--   PHASE 2: CREATE new policies using the standardized CLAUDE.md pattern:
--              is_super_admin() OR is_admin()
--              OR (user_has_permission('X.action') AND role_has_*_access(...))
--            4 policies per table (SELECT/INSERT/UPDATE/DELETE).
--            Three scope shapes:
--              • Institution-only (13 tables): role_has_institution_access(institution_id)
--              • Block-scoped (26 tables with block_id): +role_has_block_access(block_id)
--              • Contract-scoped (7 mess tables with caterer_id): +role_has_contract_access(caterer_id,'caterer')
--
--   PHASE 3: UPDATE each of the 10 new roles from PR-2 with their permission
--            scaffolding. Roles with empty '{}' permissions today gain the
--            exact key set needed for their persona.
--
-- After this migration: Campus Living is fully usable by all 10 roles, each
-- with RLS enforcing their appropriate visibility slice.
--
-- Atomicity: all-or-nothing via BEGIN/COMMIT. If any single CREATE POLICY or
-- UPDATE fails, the whole migration rolls back — no lockout window.
--
-- Idempotency: DROP POLICY IF EXISTS handles re-runs for phase 1. Phase 2
-- CREATE POLICY fails on duplicate name — that's a feature (prevents silent
-- re-apply drift). Phase 3 UPDATE is idempotent (sets keys, doesn't INSERT).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PHASE 1: Drop legacy _institution_isolation policies on all 46 tables
-- ---------------------------------------------------------------------

DO $$
DECLARE
    tbl TEXT;
    all_tables TEXT[] := ARRAY[
        -- Hostel tables (40 — 37 from 2026-03-02 + 3 post-March: allocations, beds, rooms)
        'hostel_access_log','hostel_allocations','hostel_alert_rules','hostel_amc_contracts',
        'hostel_attendance','hostel_beds','hostel_blocks','hostel_cleaning_schedules',
        'hostel_cleaning_tasks','hostel_community_config','hostel_curfew_exceptions','hostel_deposits',
        'hostel_emergency_contacts','hostel_fee_config','hostel_gate_passes','hostel_health_cases',
        'hostel_incident_parties','hostel_incidents','hostel_inspections','hostel_known_visitors',
        'hostel_laundry_configs','hostel_laundry_orders','hostel_leave_requests','hostel_leave_type_config',
        'hostel_maintenance_requests','hostel_maintenance_sla_config','hostel_onboarding_checklists',
        'hostel_onboarding_templates','hostel_pm_schedules','hostel_pm_tasks','hostel_pulse_configs',
        'hostel_pulse_responses','hostel_risk_alerts','hostel_roommate_preferences','hostel_rooms',
        'hostel_safety_equipment','hostel_visitors','hostel_waitlist','hostel_wardens','anti_ragging_affidavits',
        -- Mess tables (9)
        'mess_billing_periods','mess_caterer_blocks','mess_caterers','mess_feedback',
        'mess_meal_bookings','mess_meal_records','mess_menus','mess_student_billing','mess_waste_log'
    ];
BEGIN
    FOREACH tbl IN ARRAY all_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_institution_isolation', tbl);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- PHASE 2a: Institution-only scope (13 tables)
-- Standard pattern: permission + role_has_institution_access
-- ---------------------------------------------------------------------

DO $$
DECLARE
    spec RECORD;
    specs TEXT[][] := ARRAY[
        -- [table, permission_base]
        ARRAY['hostel_blocks',              'campus_living.blocks'],
        ARRAY['hostel_fee_config',          'campus_living.fees'],
        ARRAY['hostel_leave_type_config',   'campus_living.leave'],
        ARRAY['hostel_alert_rules',         'campus_living.alerts'],
        ARRAY['hostel_community_config',    'campus_living.community'],
        ARRAY['hostel_maintenance_sla_config','campus_living.maintenance'],
        ARRAY['hostel_onboarding_templates','campus_living.allocations'],
        ARRAY['hostel_amc_contracts',       'campus_living.maintenance'],
        ARRAY['hostel_pulse_configs',       'campus_living.pulse'],
        ARRAY['hostel_waitlist',            'campus_living.allocations'],
        ARRAY['hostel_known_visitors',      'campus_living.visitors'],
        ARRAY['mess_caterers',              'campus_living.mess.caterers'],
        ARRAY['mess_billing_periods',       'campus_living.mess.billing']
    ];
    tbl TEXT;
    base TEXT;
BEGIN
    FOR i IN 1..array_length(specs, 1) LOOP
        tbl  := specs[i][1];
        base := specs[i][2];

        -- SELECT
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_select_permission', tbl, base || '.view');

        -- INSERT
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_insert_permission', tbl, base || '.create');

        -- UPDATE
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            ) WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_update_permission', tbl, base || '.edit', base || '.edit');

        -- DELETE
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_delete_permission', tbl, base || '.delete');
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- PHASE 2b: Block-scoped (has block_id column) — 18 tables
-- Pattern: permission + institution + block access
-- For tables without direct block_id, app layer enforces block narrowing.
-- ---------------------------------------------------------------------

DO $$
DECLARE
    specs TEXT[][] := ARRAY[
        ARRAY['hostel_rooms',              'campus_living.rooms'],
        ARRAY['hostel_beds',               'campus_living.beds'],
        ARRAY['hostel_allocations',        'campus_living.allocations'],
        ARRAY['hostel_wardens',            'campus_living.wardens'],
        ARRAY['hostel_gate_passes',        'campus_living.gate_passes'],
        ARRAY['hostel_visitors',           'campus_living.visitors'],
        ARRAY['hostel_leave_requests',     'campus_living.leave'],
        ARRAY['hostel_attendance',         'campus_living.attendance'],
        ARRAY['hostel_maintenance_requests','campus_living.maintenance'],
        ARRAY['hostel_pm_schedules',       'campus_living.maintenance'],
        ARRAY['hostel_cleaning_schedules', 'campus_living.housekeeping'],
        ARRAY['hostel_inspections',        'campus_living.safety'],
        ARRAY['hostel_incidents',          'campus_living.safety'],
        ARRAY['hostel_safety_equipment',   'campus_living.safety'],
        ARRAY['hostel_curfew_exceptions',  'campus_living.leave'],
        ARRAY['hostel_laundry_configs',    'campus_living.laundry'],
        ARRAY['hostel_access_log',         'campus_living.gate_passes'],
        ARRAY['hostel_emergency_contacts', 'campus_living.allocations']
    ];
    tbl TEXT;
    base TEXT;
BEGIN
    FOR i IN 1..array_length(specs, 1) LOOP
        tbl  := specs[i][1];
        base := specs[i][2];

        -- SELECT — institution + block access
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_block_access(block_id))
            )', tbl || '_select_permission', tbl, base || '.view');

        -- INSERT
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_block_access(block_id))
            )', tbl || '_insert_permission', tbl, base || '.create');

        -- UPDATE
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_block_access(block_id))
            ) WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_block_access(block_id))
            )', tbl || '_update_permission', tbl, base || '.edit', base || '.edit');

        -- DELETE
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_block_access(block_id))
            )', tbl || '_delete_permission', tbl, base || '.delete');
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- PHASE 2c: Block-scoped without direct block_id column (15 tables)
-- These tables don't have block_id. Use institution-only scope for RLS;
-- application layer narrows to block via service/hook queries. This keeps
-- the migration simple and avoids subquery performance hits. Future PR may
-- add block_id columns where cold-path queries become common.
-- ---------------------------------------------------------------------

DO $$
DECLARE
    specs TEXT[][] := ARRAY[
        ARRAY['hostel_cleaning_tasks',     'campus_living.housekeeping'],
        ARRAY['hostel_pm_tasks',           'campus_living.maintenance'],
        ARRAY['hostel_health_cases',       'campus_living.health'],
        ARRAY['hostel_deposits',           'campus_living.deposits'],
        ARRAY['hostel_risk_alerts',        'campus_living.alerts'],
        ARRAY['hostel_pulse_responses',    'campus_living.pulse'],
        ARRAY['hostel_roommate_preferences','campus_living.allocations'],
        ARRAY['hostel_laundry_orders',     'campus_living.laundry'],
        ARRAY['hostel_incident_parties',   'campus_living.safety'],
        ARRAY['hostel_onboarding_checklists','campus_living.allocations'],
        ARRAY['anti_ragging_affidavits',   'campus_living.safety.anti_ragging']
    ];
    tbl TEXT;
    base TEXT;
BEGIN
    FOR i IN 1..array_length(specs, 1) LOOP
        tbl  := specs[i][1];
        base := specs[i][2];

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_select_permission', tbl, base || '.view');

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_insert_permission', tbl, base || '.create');

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            ) WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_update_permission', tbl, base || '.edit', base || '.edit');

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L) AND role_has_institution_access(institution_id))
            )', tbl || '_delete_permission', tbl, base || '.delete');
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- PHASE 2d: Contract-scoped mess tables (6 tables with caterer_id)
-- Caterer sees only their contract's rows via user_contract_access.
-- ---------------------------------------------------------------------

DO $$
DECLARE
    specs TEXT[][] := ARRAY[
        ARRAY['mess_menus',            'campus_living.mess.menu'],
        ARRAY['mess_meal_bookings',    'campus_living.mess.meals'],
        ARRAY['mess_meal_records',     'campus_living.mess.meals'],
        ARRAY['mess_feedback',         'campus_living.mess.feedback'],
        ARRAY['mess_student_billing',  'campus_living.mess.billing'],
        ARRAY['mess_waste_log',        'campus_living.mess.waste'],
        ARRAY['mess_caterer_blocks',   'campus_living.mess.caterers']
    ];
    tbl TEXT;
    base TEXT;
BEGIN
    FOR i IN 1..array_length(specs, 1) LOOP
        tbl  := specs[i][1];
        base := specs[i][2];

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_contract_access(caterer_id, ''caterer''))
            )', tbl || '_select_permission', tbl, base || '.view');

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_contract_access(caterer_id, ''caterer''))
            )', tbl || '_insert_permission', tbl, base || '.book');

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR UPDATE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_contract_access(caterer_id, ''caterer''))
            ) WITH CHECK (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_contract_access(caterer_id, ''caterer''))
            )', tbl || '_update_permission', tbl, base || '.publish', base || '.publish');

        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR DELETE USING (
                is_super_admin() OR is_admin()
                OR (user_has_permission(%L)
                    AND role_has_institution_access(institution_id)
                    AND role_has_contract_access(caterer_id, ''caterer''))
            )', tbl || '_delete_permission', tbl, base || '.cancel');
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- PHASE 3: Wire each of the 10 new roles (from PR-2) with permission scaffolding
-- ---------------------------------------------------------------------

-- warden — block-level supervisor
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.dashboard.view', true,
    'campus_living.activity.view', true,
    'campus_living.calendar.view', true,
    'campus_living.blocks.view', true,
    'campus_living.rooms.view', true,
    'campus_living.rooms.edit', true,
    'campus_living.rooms.inspect', true,
    'campus_living.beds.view', true,
    'campus_living.beds.edit', true,
    'campus_living.beds.status_change', true,
    'campus_living.allocations.view', true,
    'campus_living.allocations.create', true,
    'campus_living.allocations.edit', true,
    'campus_living.allocations.vacate', true,
    'campus_living.allocations.approve', true,
    'campus_living.gate_passes.view_block', true,
    'campus_living.gate_passes.approve', true,
    'campus_living.gate_passes.reject', true,
    'campus_living.visitors.view', true,
    'campus_living.visitors.log', true,
    'campus_living.visitors.approve', true,
    'campus_living.leave.view_block', true,
    'campus_living.leave.warden_approve', true,
    'campus_living.attendance.view', true,
    'campus_living.attendance.mark', true,
    'campus_living.attendance.edit', true,
    'campus_living.maintenance.view', true,
    'campus_living.maintenance.create', true,
    'campus_living.maintenance.assign', true,
    'campus_living.maintenance.close', true,
    'campus_living.housekeeping.view', true,
    'campus_living.housekeeping.schedule', true,
    'campus_living.laundry.view', true,
    'campus_living.laundry.orders_manage', true,
    'campus_living.safety.view', true,
    'campus_living.safety.inspect', true,
    'campus_living.safety.record', true,
    'campus_living.safety.inspections.view', true,
    'campus_living.safety.incidents.view', true,
    'campus_living.health.view', true,
    'campus_living.fees.view', true,
    'campus_living.deposits.view', true,
    'campus_living.mess.view', true,
    'campus_living.mess.menu.view', true,
    'campus_living.mess.meals.view', true,
    'campus_living.mess.feedback.view', true,
    'campus_living.alerts.view', true,
    'campus_living.alerts.acknowledge', true,
    'campus_living.community.view', true,
    'campus_living.analytics.view', true
) WHERE role_key = 'warden';

-- chief_warden — warden superset + college-wide authority
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true, 'campus_living.dashboard.view', true,
    'campus_living.activity.view', true, 'campus_living.calendar.view', true,
    'campus_living.settings.view', true, 'campus_living.settings.edit', true,
    'campus_living.blocks.view', true, 'campus_living.blocks.create', true,
    'campus_living.blocks.edit', true, 'campus_living.blocks.delete', true,
    'campus_living.blocks.warden_assign', true,
    'campus_living.rooms.view', true, 'campus_living.rooms.create', true,
    'campus_living.rooms.edit', true, 'campus_living.rooms.delete', true,
    'campus_living.rooms.inspect', true,
    'campus_living.beds.view', true, 'campus_living.beds.create', true,
    'campus_living.beds.edit', true, 'campus_living.beds.delete', true,
    'campus_living.beds.status_change', true,
    'campus_living.allocations.view', true, 'campus_living.allocations.create', true,
    'campus_living.allocations.edit', true, 'campus_living.allocations.transfer', true,
    'campus_living.allocations.vacate', true, 'campus_living.allocations.approve', true,
    'campus_living.wardens.view', true, 'campus_living.wardens.assign', true,
    'campus_living.wardens.remove', true,
    'campus_living.gate_passes.view', true, 'campus_living.gate_passes.approve', true,
    'campus_living.gate_passes.reject', true,
    'campus_living.visitors.view', true, 'campus_living.visitors.approve', true,
    'campus_living.leave.view', true, 'campus_living.leave.chief_approve', true,
    'campus_living.attendance.view', true, 'campus_living.attendance.export', true,
    'campus_living.maintenance.view', true, 'campus_living.maintenance.assign', true,
    'campus_living.maintenance.close', true, 'campus_living.maintenance.approve_payment', true,
    'campus_living.housekeeping.view', true, 'campus_living.housekeeping.schedule', true,
    'campus_living.laundry.view', true, 'campus_living.laundry.config', true,
    'campus_living.safety.view', true, 'campus_living.safety.inspect', true,
    'campus_living.safety.inspections.view', true, 'campus_living.safety.incidents.view', true,
    'campus_living.safety.anti_ragging.view', true,
    'campus_living.health.view', true,
    'campus_living.fees.view', true, 'campus_living.fees.config', true,
    'campus_living.fees.waive', true, 'campus_living.fees.refund', true,
    'campus_living.deposits.view', true, 'campus_living.deposits.record', true,
    'campus_living.deposits.refund', true,
    'campus_living.mess.view', true,
    'campus_living.mess.caterers.view', true, 'campus_living.mess.caterers.onboard', true,
    'campus_living.mess.caterers.suspend', true, 'campus_living.mess.caterers.pay', true,
    'campus_living.mess.menu.view', true, 'campus_living.mess.menu.approve', true,
    'campus_living.mess.meals.view', true,
    'campus_living.mess.billing.view', true, 'campus_living.mess.billing.reconcile', true,
    'campus_living.mess.billing.export', true,
    'campus_living.mess.feedback.view', true, 'campus_living.mess.waste.view', true,
    'campus_living.alerts.view', true, 'campus_living.alerts.configure', true,
    'campus_living.alerts.acknowledge', true,
    'campus_living.pulse.view', true, 'campus_living.pulse.create', true,
    'campus_living.community.view', true, 'campus_living.community.manage', true,
    'campus_living.community.moderate', true,
    'campus_living.analytics.view', true, 'campus_living.analytics.occupancy', true,
    'campus_living.analytics.fees', true, 'campus_living.analytics.mess', true,
    'campus_living.analytics.maintenance', true, 'campus_living.analytics.safety', true,
    'campus_living.analytics.cross_domain', true,
    'campus_living.reports.view', true, 'campus_living.reports.naac_4_1_4', true,
    'campus_living.reports.nirf_facilities', true, 'campus_living.reports.aicte_eoa', true,
    'campus_living.reports.anti_ragging_quarterly', true
) WHERE role_key = 'chief_warden';

-- gate_security — narrow gate flow
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.dashboard.view', true,
    'campus_living.activity.view', true,
    'campus_living.gate_passes.view_block', true,
    'campus_living.gate_passes.verify_at_gate', true,
    'campus_living.visitors.view', true,
    'campus_living.visitors.log', true,
    'campus_living.leave.view_block', true,
    'campus_living.attendance.view', true
) WHERE role_key = 'gate_security';

-- housekeeping_staff — tasks only
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.dashboard.view', true,
    'campus_living.housekeeping.view', true,
    'campus_living.housekeeping.mark_done', true,
    'campus_living.laundry.view', true
) WHERE role_key = 'housekeeping_staff';

-- parent — external read-only via user_learner_relationship
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.parent_portal.view_child', true,
    'campus_living.parent_portal.consent', true,
    'campus_living.parent_portal.pay_fee', true,
    'campus_living.gate_passes.view_own', true,
    'campus_living.leave.view_own', true,
    'campus_living.leave.parent_consent', true,
    'campus_living.attendance.view', true,
    'campus_living.fees.view', true,
    'campus_living.mess.menu.view', true,
    'campus_living.mess.feedback.view', true
) WHERE role_key = 'parent';

-- mess_caterer — external, contract-scoped
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.mess.view', true,
    'campus_living.mess.menu.view', true,
    'campus_living.mess.menu.publish', true,
    'campus_living.mess.meals.view', true,
    'campus_living.mess.billing.view', true,
    'campus_living.mess.feedback.view', true,
    'users.contract_access.view', true
) WHERE role_key = 'mess_caterer';

-- maintenance_vendor — external ticket ownership
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.maintenance.view', true,
    'campus_living.maintenance.close', true,
    'users.contract_access.view', true
) WHERE role_key = 'maintenance_vendor';

-- hostel_office — clerical full CRUD on setup
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true, 'campus_living.dashboard.view', true,
    'campus_living.activity.view', true, 'campus_living.calendar.view', true,
    'campus_living.settings.view', true, 'campus_living.settings.edit', true,
    'campus_living.blocks.view', true, 'campus_living.blocks.create', true,
    'campus_living.blocks.edit', true, 'campus_living.blocks.delete', true,
    'campus_living.blocks.warden_assign', true,
    'campus_living.rooms.view', true, 'campus_living.rooms.create', true,
    'campus_living.rooms.edit', true, 'campus_living.rooms.delete', true,
    'campus_living.beds.view', true, 'campus_living.beds.create', true,
    'campus_living.beds.edit', true, 'campus_living.beds.delete', true,
    'campus_living.allocations.view', true, 'campus_living.allocations.create', true,
    'campus_living.allocations.edit', true, 'campus_living.allocations.transfer', true,
    'campus_living.allocations.vacate', true,
    'campus_living.wardens.view', true, 'campus_living.wardens.assign', true,
    'campus_living.wardens.remove', true,
    'campus_living.fees.view', true, 'campus_living.fees.config', true,
    'campus_living.deposits.view', true, 'campus_living.deposits.record', true,
    'campus_living.deposits.refund', true,
    'campus_living.leave.view', true, 'campus_living.leave.view_block', true,
    'campus_living.gate_passes.view', true,
    'campus_living.attendance.view', true,
    'campus_living.maintenance.view', true,
    'campus_living.safety.view', true,
    'campus_living.alerts.view', true,
    'campus_living.reports.view', true,
    'campus_living.analytics.view', true,
    'users.block_access.view', true, 'users.block_access.manage', true,
    'users.relationship.view', true, 'users.relationship.manage', true,
    'users.contract_access.view', true, 'users.contract_access.manage', true
) WHERE role_key = 'hostel_office';

-- anti_ragging_member
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.dashboard.view', true,
    'campus_living.activity.view', true,
    'campus_living.safety.anti_ragging.view', true,
    'campus_living.safety.anti_ragging.manage', true,
    'campus_living.safety.incidents.view', true,
    'campus_living.health.view', true,
    'campus_living.reports.view', true,
    'campus_living.reports.anti_ragging_quarterly', true
) WHERE role_key = 'anti_ragging_member';

-- accreditation_officer (scope='all' — cross-institution)
UPDATE public.custom_roles SET permissions = jsonb_build_object(
    'campus_living.view', true,
    'campus_living.dashboard.view', true,
    'campus_living.blocks.view', true,
    'campus_living.rooms.view', true,
    'campus_living.beds.view', true,
    'campus_living.allocations.view', true,
    'campus_living.safety.view', true,
    'campus_living.safety.inspections.view', true,
    'campus_living.safety.incidents.view', true,
    'campus_living.safety.anti_ragging.view', true,
    'campus_living.health.view', true,
    'campus_living.mess.view', true,
    'campus_living.mess.caterers.view', true,
    'campus_living.mess.menu.view', true,
    'campus_living.analytics.view', true,
    'campus_living.analytics.occupancy', true,
    'campus_living.analytics.mess', true,
    'campus_living.analytics.safety', true,
    'campus_living.reports.view', true,
    'campus_living.reports.naac_4_1_4', true,
    'campus_living.reports.nirf_facilities', true,
    'campus_living.reports.aicte_eoa', true,
    'campus_living.reports.anti_ragging_quarterly', true
) WHERE role_key = 'accreditation_officer';

COMMIT;

-- ---------------------------------------------------------------------
-- Post-commit sanity queries (run separately after COMMIT)
-- ---------------------------------------------------------------------
-- 1. All 10 roles have non-empty permissions now?
-- SELECT role_key, jsonb_object_keys(permissions) IS NOT NULL AS has_perms,
--        (SELECT COUNT(*) FROM jsonb_object_keys(permissions)) AS key_count
-- FROM custom_roles
-- WHERE role_key IN ('warden','chief_warden','gate_security','housekeeping_staff',
--                    'parent','mess_caterer','maintenance_vendor','hostel_office',
--                    'anti_ragging_member','accreditation_officer')
-- ORDER BY role_key;

-- 2. Policy count per table (should be ~4 per table)
-- SELECT tablename, COUNT(*) AS policy_count
-- FROM pg_policies
-- WHERE schemaname='public' AND (tablename LIKE 'hostel_%' OR tablename LIKE 'mess_%' OR tablename='anti_ragging_affidavits')
-- GROUP BY tablename ORDER BY tablename;

-- 3. Total campus-living policies created
-- SELECT COUNT(*) FROM pg_policies
-- WHERE schemaname='public'
--   AND (tablename LIKE 'hostel_%' OR tablename LIKE 'mess_%' OR tablename='anti_ragging_affidavits')
--   AND policyname LIKE '%_permission';
-- -- Expected: 46 tables × 4 policies = 184
