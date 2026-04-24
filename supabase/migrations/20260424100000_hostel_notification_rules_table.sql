-- =====================================================================
-- Campus Living — hostel_notification_rules table
-- Date: 2026-04-24
-- Agent: F (migrations only; paired with Agent G service/hook wiring)
-- Context: PR #449 (Agent D, settings fake-Save audit) left
--          /campus-living/settings/notification-rules in preview mode
--          because the backing table did not exist. This migration
--          creates the table + RLS + triggers + seed so Agent G can
--          wire the real save handler.
--
-- Schema spec'd inline in the page's docstring by Agent D:
--   app/(routes)/campus-living/settings/notification-rules/page.tsx
--
-- What this migration does:
--
--   PHASE 1: CREATE TABLE hostel_notification_rules — institution-scoped,
--            one row per (institution_id, event_key). Matrix of
--            {category, event_key, event_label} with three channel
--            toggles (email / sms / push) and is_active master switch.
--
--   PHASE 2: updated_at BEFORE UPDATE trigger using the existing
--            update_updated_at_column() convention.
--
--   PHASE 3: RLS — 4 policies using the canonical CLAUDE.md pattern
--            (is_super_admin() OR is_admin() OR (user_has_permission +
--            role_has_institution_access)). DELETE is super_admin/admin
--            only — rules are seeded defaults, not user-authored rows.
--
--   PHASE 4: Seed 16 default rules × every existing institution. Defaults
--            mirror the channel checkboxes rendered in the page today
--            (same UX the fake-save page showed). is_active = true so the
--            system is "on by default" once notification dispatch lands.
--
-- Atomicity: single BEGIN/COMMIT — all-or-nothing.
-- Idempotency: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING,
--              DROP POLICY IF EXISTS, DROP TRIGGER IF EXISTS.
-- Rollback: drop policies, drop trigger, drop table.
--
-- Note on event count: Agent D's PR #449 body mentioned "17 rows per
-- institution" but the page renders exactly 16 events (3 leave + 4
-- maintenance + 3 safety + 3 mess + 3 fees). Seeding what the page
-- actually shows (16) to keep Seed <-> UI in sync.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PHASE 1: hostel_notification_rules table
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.hostel_notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    event_key TEXT NOT NULL,
    event_label TEXT NOT NULL,
    channel_email BOOLEAN NOT NULL DEFAULT true,
    channel_sms BOOLEAN NOT NULL DEFAULT false,
    channel_push BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_hostel_notification_rule_event_per_institution
        UNIQUE (institution_id, event_key),
    CONSTRAINT chk_hostel_notification_rules_category
        CHECK (category IN ('leave', 'maintenance', 'safety', 'mess', 'fees'))
);

COMMENT ON TABLE public.hostel_notification_rules IS
  'Per-institution notification preferences matrix. One row per (institution, event_key). '
  'Each row stores which channels (email/sms/push) fire for a given hostel event. '
  'Spec''d in app/(routes)/campus-living/settings/notification-rules/page.tsx docstring by Agent D, '
  'table created by Agent F in PR follow-up to #449.';

COMMENT ON COLUMN public.hostel_notification_rules.category IS
  'Coarse grouping used by the settings page to bucket rules into cards. '
  'Constrained to the 5 categories rendered today: leave, maintenance, safety, mess, fees.';

COMMENT ON COLUMN public.hostel_notification_rules.event_key IS
  'Stable machine-readable id for the event (e.g. leave_submitted). Unique per institution. '
  'Notification-dispatch code keys off this to look up channel prefs at fire time.';

COMMENT ON COLUMN public.hostel_notification_rules.is_active IS
  'Master toggle — false disables the rule entirely regardless of per-channel flags. '
  'Lets an admin temporarily silence a noisy event without losing channel config.';

CREATE INDEX IF NOT EXISTS hostel_notification_rules_institution_idx
  ON public.hostel_notification_rules (institution_id);

CREATE INDEX IF NOT EXISTS hostel_notification_rules_event_key_idx
  ON public.hostel_notification_rules (event_key);

CREATE INDEX IF NOT EXISTS hostel_notification_rules_category_idx
  ON public.hostel_notification_rules (category);

ALTER TABLE public.hostel_notification_rules ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- PHASE 2: updated_at trigger (canonical campus-living convention)
-- ---------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_hostel_notification_rules_updated_at
  ON public.hostel_notification_rules;
CREATE TRIGGER trg_hostel_notification_rules_updated_at
  BEFORE UPDATE ON public.hostel_notification_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- PHASE 3: RLS policies (canonical CLAUDE.md pattern)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS hostel_notification_rules_select_permission
  ON public.hostel_notification_rules;
CREATE POLICY hostel_notification_rules_select_permission
  ON public.hostel_notification_rules FOR SELECT
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.view')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_notification_rules_insert_permission
  ON public.hostel_notification_rules;
CREATE POLICY hostel_notification_rules_insert_permission
  ON public.hostel_notification_rules FOR INSERT
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.edit')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_notification_rules_update_permission
  ON public.hostel_notification_rules;
CREATE POLICY hostel_notification_rules_update_permission
  ON public.hostel_notification_rules FOR UPDATE
  USING (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.edit')
          AND role_has_institution_access(institution_id))
  )
  WITH CHECK (
      is_super_admin() OR is_admin()
      OR (user_has_permission('campus_living.settings.edit')
          AND role_has_institution_access(institution_id))
  );

DROP POLICY IF EXISTS hostel_notification_rules_delete_permission
  ON public.hostel_notification_rules;
CREATE POLICY hostel_notification_rules_delete_permission
  ON public.hostel_notification_rules FOR DELETE
  USING (
      is_super_admin() OR is_admin()
  );

-- ---------------------------------------------------------------------
-- PHASE 4: Seed 16 default rules × every institution
-- Defaults mirror the channel toggles shown on the page today so the
-- matrix renders identically to what admins saw before the wire-up.
-- ---------------------------------------------------------------------

INSERT INTO public.hostel_notification_rules (
    institution_id, category, event_key, event_label,
    channel_email, channel_sms, channel_push, is_active
)
SELECT
    i.id AS institution_id,
    defaults.category,
    defaults.event_key,
    defaults.event_label,
    defaults.channel_email,
    defaults.channel_sms,
    defaults.channel_push,
    true AS is_active
FROM public.institutions i
CROSS JOIN (
    VALUES
        -- Leave Management (3)
        ('leave',       'leave_submitted',          'Leave request submitted',    true,  false, true),
        ('leave',       'leave_approved_rejected',  'Leave approved/rejected',    true,  true,  true),
        ('leave',       'leave_returning_reminder', 'Leave returning reminder',   false, true,  true),
        -- Maintenance (4)
        ('maintenance', 'maintenance_created',      'New request created',        true,  false, true),
        ('maintenance', 'maintenance_assigned',     'Request assigned',           true,  false, true),
        ('maintenance', 'maintenance_resolved',     'Request resolved',           true,  false, true),
        ('maintenance', 'maintenance_sla_breach',   'SLA breach warning',         true,  true,  true),
        -- Safety (3)
        ('safety',      'incident_reported',        'Incident reported',          true,  true,  true),
        ('safety',      'curfew_violation',         'Curfew violation',           true,  true,  true),
        ('safety',      'unauthorized_entry',       'Unauthorized entry',         true,  true,  true),
        -- Mess (3)
        ('mess',        'mess_menu_published',      'Menu published',             false, false, true),
        ('mess',        'mess_opt_out_approved',    'Meal opt-out approved',      true,  false, true),
        ('mess',        'mess_low_rating_alert',    'Low rating alert',           true,  false, false),
        -- Fees (3)
        ('fees',        'fees_payment_reminder',    'Payment reminder',           true,  true,  true),
        ('fees',        'fees_payment_received',    'Payment received',           true,  true,  true),
        ('fees',        'fees_overdue_notice',      'Overdue notice',             true,  true,  true)
) AS defaults(
    category, event_key, event_label,
    channel_email, channel_sms, channel_push
)
ON CONFLICT (institution_id, event_key) DO NOTHING;

COMMIT;

-- =====================================================================
-- Post-migration verification (run in Supabase SQL Editor)
-- =====================================================================
--
-- -- 1. Seed populated for all institutions:
-- SELECT i.name AS institution,
--        COUNT(r.id) AS rule_count
-- FROM public.institutions i
-- LEFT JOIN public.hostel_notification_rules r ON r.institution_id = i.id
-- GROUP BY i.id, i.name
-- ORDER BY i.name;
-- -- Expected: 16 rows per institution.
--
-- -- 2. Category distribution:
-- SELECT category, COUNT(*) AS events
-- FROM public.hostel_notification_rules
-- GROUP BY category
-- ORDER BY category;
-- -- Expected per-institution counts ×N institutions:
-- --   fees=3, leave=3, maintenance=4, mess=3, safety=3
--
-- -- 3. RLS policies:
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE tablename = 'hostel_notification_rules'
-- ORDER BY policyname;
-- -- Expected: 4 rows (select/insert/update/delete)_permission.
--
-- -- 4. Trigger installed:
-- SELECT tgname, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'public.hostel_notification_rules'::regclass
--   AND NOT tgisinternal;
-- -- Expected: trg_hostel_notification_rules_updated_at, O (origin).
