-- =============================================================================
-- Billing Apportionment — Internal Revenue-Head Split (SUBSTRATE, lean v2)
-- Spec: specs/billing-apportionment-spec-2026-06-09.md
-- Created: 2026-06-09
--
-- WHAT: Internal, accounts-only overlay recording how much of a BUNDLED tuition
--       bill belongs to a revenue head, WITHOUT mutating the student bill.
--
-- PATTERN-EXTEND (Director directive): the "revenue head" IS an existing
--   billing_categories row (Hostel Fee, Transport Fee, Mess Fee). NO parallel
--   head-catalog table. Head management = existing /billing/categories UI.
--
-- The ONLY genuinely-new substrate (because billing_student_bills is FLAT — one
-- item_category_id, no child line-items):
--   * billing_apportionment_rules        — per-package default splits
--   * billing_bill_apportionments         — per-bill resolved splits (dashboard reads)
--   * billing_apportionment_audit         — unified money-trail
--
-- HARD INVARIANTS (spec §3): zero writes to billing_student_bills; approved-only
--   feeds revenue; SUM(apportioned) ≤ bill.final_amount; dual-control.
--
-- Requires: 20260704999000_billing_category_kind_add_mess.sql (adds 'mess' kind).
-- Idempotent. Anon-revoked.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Seed the Mess Fee category (Hostel Fee + Transport Fee already exist)
--    Mirrors sibling shape: amount NULL, frequency 'one-time' (NOT NULL), active.
-- -----------------------------------------------------------------------------
INSERT INTO billing_categories (category_name, amount, frequency, description, is_active, kind)
SELECT 'Mess Fee', NULL, 'one-time',
       'Food/mess revenue head. Used by apportionment to split mess out of bundled bills (mess_student_billing remains the live per-day rail).',
       true, 'mess'::billing_category_kind
WHERE NOT EXISTS (
  SELECT 1 FROM billing_categories WHERE kind = 'mess'::billing_category_kind OR category_name = 'Mess Fee'
);

-- -----------------------------------------------------------------------------
-- 1. PER-PACKAGE DEFAULT RULES (head = billing_categories row; create→approve)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_apportionment_rules (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID REFERENCES institutions(id),                    -- NULL = all institutions (super-admin only to write)
  fee_structure_id      UUID REFERENCES admission_fee_structures(id),
  accommodation_type_id UUID REFERENCES accommodation_types(id),
  billing_category_id   UUID NOT NULL REFERENCES billing_categories(id),     -- the HEAD = existing category (Hostel/Transport/Mess Fee)
  split_method          TEXT NOT NULL CHECK (split_method IN ('fixed','percent')),
  split_value           NUMERIC(12,2) NOT NULL CHECK (split_value >= 0),
  effective_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','pending_approval','approved','rejected')),
  approved_by           UUID REFERENCES profiles(id),
  approved_at           TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES profiles(id),
  updated_by            UUID REFERENCES profiles(id),
  change_reason         TEXT,
  CONSTRAINT billing_appn_rules_percent_max CHECK (split_method <> 'percent' OR split_value <= 100),
  CONSTRAINT billing_appn_rules_has_scope   CHECK (fee_structure_id IS NOT NULL OR accommodation_type_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS billing_appn_rules_scope_cat_unique
  ON billing_apportionment_rules(
       COALESCE(fee_structure_id,      '00000000-0000-0000-0000-000000000000'::uuid),
       COALESCE(accommodation_type_id, '00000000-0000-0000-0000-000000000000'::uuid),
       billing_category_id)
  WHERE is_active = true AND status = 'approved';

-- -----------------------------------------------------------------------------
-- 2. RESOLVED PER-BILL ENTRIES (the money records the dashboard reads)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_bill_apportionments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id             UUID NOT NULL REFERENCES billing_student_bills(id),   -- READ-only FK; never written back
  institution_id      UUID NOT NULL REFERENCES institutions(id),           -- auto-set from bill by guard trigger
  billing_category_id UUID NOT NULL REFERENCES billing_categories(id),     -- the HEAD = existing category
  amount              NUMERIC(12,2) NOT NULL CHECK (amount >= 0),          -- ABSOLUTE rupees (percent resolved at apply-time)
  source              TEXT NOT NULL CHECK (source IN ('rule','manual','backfill')),
  source_rule_id      UUID REFERENCES billing_apportionment_rules(id),
  source_method       TEXT CHECK (source_method IN ('fixed','percent')),
  source_value        NUMERIC(12,2),
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','pending_approval','approved','rejected')),
  approved_by         UUID REFERENCES profiles(id),
  approved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES profiles(id),
  updated_by          UUID REFERENCES profiles(id),
  change_reason       TEXT
);

CREATE INDEX IF NOT EXISTS billing_bill_appn_bill_idx     ON billing_bill_apportionments(bill_id);
CREATE INDEX IF NOT EXISTS billing_bill_appn_cat_status_idx ON billing_bill_apportionments(billing_category_id, status);
CREATE INDEX IF NOT EXISTS billing_bill_appn_inst_idx     ON billing_bill_apportionments(institution_id);
CREATE UNIQUE INDEX IF NOT EXISTS billing_bill_appn_bill_cat_unique
  ON billing_bill_apportionments(bill_id, billing_category_id) WHERE status <> 'rejected';

-- -----------------------------------------------------------------------------
-- 3. UNIFIED AUDIT LOG
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing_apportionment_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('rule','bill_apportionment')),
  entity_id     UUID NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('insert','update','delete','approve','reject')),
  old_value     JSONB,
  new_value     JSONB,
  changed_by    UUID REFERENCES profiles(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  change_reason TEXT
);
CREATE INDEX IF NOT EXISTS billing_appn_audit_entity_idx ON billing_apportionment_audit(entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- 4. GUARD TRIGGER — auto-set institution from bill + enforce SUM ≤ bill total
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_billing_apportionment_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bill_total NUMERIC(12,2);
  v_bill_inst  UUID;
  v_sum        NUMERIC(12,2);
BEGIN
  SELECT final_amount, institution_id INTO v_bill_total, v_bill_inst
    FROM billing_student_bills WHERE id = NEW.bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Apportionment references non-existent bill %', NEW.bill_id;
  END IF;

  NEW.institution_id := v_bill_inst;  -- institution always derives from the bill

  IF v_bill_total IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_sum
      FROM billing_bill_apportionments
      WHERE bill_id = NEW.bill_id AND status <> 'rejected' AND id <> NEW.id;
    IF (v_sum + NEW.amount) > v_bill_total THEN
      RAISE EXCEPTION 'Apportionment % + % exceeds bill total % for bill %',
        v_sum, NEW.amount, v_bill_total, NEW.bill_id;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS billing_apportionment_guard_trg ON billing_bill_apportionments;
CREATE TRIGGER billing_apportionment_guard_trg
  BEFORE INSERT OR UPDATE ON billing_bill_apportionments
  FOR EACH ROW EXECUTE FUNCTION fn_billing_apportionment_guard();

-- -----------------------------------------------------------------------------
-- 5. AUDIT TRIGGERS (one thin function per table → unified audit log)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_billing_appn_rules_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO billing_apportionment_audit(entity_type, entity_id, action, old_value, new_value, changed_by, change_reason)
  VALUES ('rule', COALESCE(NEW.id, OLD.id),
          CASE WHEN TG_OP='UPDATE' AND NEW.status='approved' AND OLD.status<>'approved' THEN 'approve'
               WHEN TG_OP='UPDATE' AND NEW.status='rejected' AND OLD.status<>'rejected' THEN 'reject'
               ELSE lower(TG_OP) END,
          to_jsonb(OLD), to_jsonb(NEW), auth.uid(), COALESCE(NEW.change_reason, OLD.change_reason));
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE FUNCTION fn_billing_bill_appn_audit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO billing_apportionment_audit(entity_type, entity_id, action, old_value, new_value, changed_by, change_reason)
  VALUES ('bill_apportionment', COALESCE(NEW.id, OLD.id),
          CASE WHEN TG_OP='UPDATE' AND NEW.status='approved' AND OLD.status<>'approved' THEN 'approve'
               WHEN TG_OP='UPDATE' AND NEW.status='rejected' AND OLD.status<>'rejected' THEN 'reject'
               ELSE lower(TG_OP) END,
          to_jsonb(OLD), to_jsonb(NEW), auth.uid(), COALESCE(NEW.change_reason, OLD.change_reason));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS billing_appn_rules_audit_trg ON billing_apportionment_rules;
CREATE TRIGGER billing_appn_rules_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON billing_apportionment_rules
  FOR EACH ROW EXECUTE FUNCTION fn_billing_appn_rules_audit();

DROP TRIGGER IF EXISTS billing_bill_appn_audit_trg ON billing_bill_apportionments;
CREATE TRIGGER billing_bill_appn_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON billing_bill_apportionments
  FOR EACH ROW EXECUTE FUNCTION fn_billing_bill_appn_audit();

-- -----------------------------------------------------------------------------
-- 6. RLS — mirrors the live billing_bills_*_permission convention verbatim
-- -----------------------------------------------------------------------------
ALTER TABLE billing_apportionment_rules    ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_bill_apportionments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_apportionment_audit    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON billing_apportionment_rules, billing_bill_apportionments,
              billing_apportionment_audit FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON billing_apportionment_rules,
              billing_bill_apportionments TO authenticated;
GRANT  SELECT ON billing_apportionment_audit TO authenticated;

-- 6a. rules (institution-scoped; NULL scope = all-institution, super-admin only to write)
DROP POLICY IF EXISTS appn_rules_select ON billing_apportionment_rules;
CREATE POLICY appn_rules_select ON billing_apportionment_rules
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('billing.apportionment.view')
        AND (institution_id IS NULL OR role_has_institution_access(institution_id)))
  );
DROP POLICY IF EXISTS appn_rules_insert ON billing_apportionment_rules;
CREATE POLICY appn_rules_insert ON billing_apportionment_rules
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR (user_has_permission('billing.apportionment.create')
        AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
  );
DROP POLICY IF EXISTS appn_rules_update ON billing_apportionment_rules;
CREATE POLICY appn_rules_update ON billing_apportionment_rules
  FOR UPDATE USING (
    is_super_admin()
    OR (user_has_permission('billing.apportionment.edit')
        AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
  );
DROP POLICY IF EXISTS appn_rules_delete ON billing_apportionment_rules;
CREATE POLICY appn_rules_delete ON billing_apportionment_rules
  FOR DELETE USING (
    is_super_admin()
    OR (user_has_permission('billing.apportionment.delete')
        AND institution_id IS NOT NULL AND role_has_institution_access(institution_id))
  );

-- 6b. bill_apportionments (institution NOT NULL — straight billing_bills convention)
DROP POLICY IF EXISTS bill_appn_select ON billing_bill_apportionments;
CREATE POLICY bill_appn_select ON billing_bill_apportionments
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('billing.apportionment.view') AND role_has_institution_access(institution_id))
  );
DROP POLICY IF EXISTS bill_appn_insert ON billing_bill_apportionments;
CREATE POLICY bill_appn_insert ON billing_bill_apportionments
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('billing.apportionment.create') AND role_has_institution_access(institution_id))
  );
DROP POLICY IF EXISTS bill_appn_update ON billing_bill_apportionments;
CREATE POLICY bill_appn_update ON billing_bill_apportionments
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('billing.apportionment.edit') AND role_has_institution_access(institution_id))
  );
DROP POLICY IF EXISTS bill_appn_delete ON billing_bill_apportionments;
CREATE POLICY bill_appn_delete ON billing_bill_apportionments
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('billing.apportionment.delete') AND role_has_institution_access(institution_id))
  );

-- 6c. audit (read-only to viewers; writes only via SECURITY DEFINER triggers)
DROP POLICY IF EXISTS appn_audit_select ON billing_apportionment_audit;
CREATE POLICY appn_audit_select ON billing_apportionment_audit
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR user_has_permission('billing.apportionment.view')
  );

-- =============================================================================
-- END SUBSTRATE. RPCs in 20260705000100_billing_apportionment_rpcs.sql
-- Heads = billing_categories rows (Hostel Fee / Transport Fee / Mess Fee).
-- =============================================================================
