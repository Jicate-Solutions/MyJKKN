# TQM MIGRATION FIX CHECKLIST

**Date:** 2026-02-05
**Database:** Staging (hhprjbgknupaplivtoib)
**Status:** ❌ 2 CRITICAL ISSUES DETECTED

---

## CRITICAL ISSUES REQUIRING IMMEDIATE FIX

### ❌ ISSUE 1: Missing `parent_sessions` Table (F003)

**Impact:** Parent authentication will fail completely

**Status:** Not Started ⬜

**Steps to Fix:**

- [ ] Step 1: Verify migration file exists and is correct
  ```bash
  cat /Users/omm/PROJECTS/MyJKKN/supabase/migrations/20260201100002_create_parent_sessions.sql
  ```

- [ ] Step 2: If file is empty/missing, create migration manually
  ```bash
  # Copy from SCHEMA_DIFF_REPORT.md "Fix 1"
  ```

- [ ] Step 3: Apply fix to staging
  ```bash
  cd /Users/omm/PROJECTS/MyJKKN
  ~/bin/supabase db push --project-ref hhprjbgknupaplivtoib
  ```

- [ ] Step 4: Verify table was created
  ```sql
  SELECT COUNT(*) FROM parent_sessions;
  -- Expected: Query should work (even if 0 rows)
  ```

- [ ] Step 5: Test parent authentication flow
  ```bash
  # Use /browser-test skill to test login
  ```

**Success Criteria:**
- ✅ Table `parent_sessions` exists
- ✅ All 3 indexes created
- ✅ RLS enabled with 3 policies
- ✅ Parent login/logout works in browser test

---

### ❌ ISSUE 2: COPQ Financial Precision Not Fixed (F007)

**Impact:** Floating-point errors in financial calculations, audit compliance risk

**Status:** Not Started ⬜

**Steps to Fix:**

- [ ] Step 1: Verify current data type
  ```sql
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'billing_copq_incidents'
  AND column_name IN ('visible_cost', 'hidden_cost_estimate');
  -- Current: DECIMAL(12,2) - WRONG
  -- Expected: BIGINT - CORRECT
  ```

- [ ] Step 2: Back up existing data
  ```sql
  CREATE TABLE billing_copq_incidents_backup AS
  SELECT * FROM billing_copq_incidents;
  ```

- [ ] Step 3: Apply precision fix
  ```bash
  # Copy SQL from SCHEMA_DIFF_REPORT.md "Fix 2"
  # Run via supabase SQL editor or CLI
  ```

- [ ] Step 4: Verify data type changed
  ```sql
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'billing_copq_incidents'
  AND column_name IN ('visible_cost', 'hidden_cost_estimate');
  -- Expected: bigint | null | null
  ```

- [ ] Step 5: Test arithmetic precision
  ```sql
  -- Insert test record with ₹100.10 (10010 paisa)
  INSERT INTO billing_copq_incidents (
    institution_id, incident_date, category,
    description, visible_cost, hidden_cost_estimate
  ) VALUES (
    (SELECT id FROM institutions LIMIT 1),
    CURRENT_DATE,
    'refund_processing',
    'Test precision',
    10010,  -- ₹100.10 in paisa
    20020   -- ₹200.20 in paisa
  );

  -- Verify addition works correctly
  SELECT
    visible_cost,
    hidden_cost_estimate,
    visible_cost + hidden_cost_estimate AS total_paisa,
    (visible_cost + hidden_cost_estimate) / 100.0 AS total_rupees
  FROM billing_copq_incidents WHERE description = 'Test precision';

  -- Expected: 30030 paisa = ₹300.30 (EXACT)
  -- NOT: 300.2999999999
  ```

- [ ] Step 6: Update views and functions
  ```sql
  -- Views should auto-update
  -- Verify dashboard function returns paisa values
  SELECT get_billing_copq_dashboard(
    (SELECT id FROM institutions LIMIT 1),
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
  );
  ```

- [ ] Step 7: Clean up test data
  ```sql
  DELETE FROM billing_copq_incidents WHERE description = 'Test precision';
  DROP TABLE billing_copq_incidents_backup;
  ```

**Success Criteria:**
- ✅ visible_cost is BIGINT
- ✅ hidden_cost_estimate is BIGINT
- ✅ Arithmetic precision test passes (30030 paisa = ₹300.30)
- ✅ Dashboard function returns paisa values
- ✅ No floating-point errors in calculations

---

## VERIFICATION CHECKLIST

After both fixes are applied, run full verification:

### Database Schema Verification

- [ ] All 25+ TQM tables exist
- [ ] All indexes created (80+ indexes)
- [ ] All RLS policies enabled (25+ policies)
- [ ] All functions created (30+ functions)
- [ ] All triggers active (15+ triggers)
- [ ] All views created (4 views)
- [ ] All enums defined (6+ enums)

### Feature Testing

- [ ] **F001 - NPS Surveys**
  - [ ] Create survey for each stakeholder type
  - [ ] Submit responses
  - [ ] Verify NPS score calculation
  - [ ] Check analytics dashboard

- [ ] **F002 - Process Excellence**
  - [ ] Create process definition with stages
  - [ ] Track process instance
  - [ ] Log TIMWOOD waste incident
  - [ ] Generate audit report

- [ ] **F003 - Parent Portal** ⚠️ CRITICAL
  - [ ] Parent OTP login works
  - [ ] Session persists across page loads
  - [ ] View learner attendance
  - [ ] View learner fees
  - [ ] Logout clears session

- [ ] **F004 - Grievance System**
  - [ ] Create ticket (verify GRV-YYYYMMDD-XXXX format)
  - [ ] Add comments
  - [ ] Assign to staff
  - [ ] Track SLA status (on_track, at_risk, breached)
  - [ ] Resolve ticket

- [ ] **F005 - Maturity Assessment**
  - [ ] Create framework with 6 dimensions
  - [ ] Perform assessment
  - [ ] Verify overall_stage auto-calculation
  - [ ] Add evidence
  - [ ] Track improvement actions

- [ ] **F006 - OKR ABCD Matrix**
  - [ ] Add process_rating to key result
  - [ ] Verify ABCD category auto-calculation
  - [ ] Check A (Good Process + Good Result)
  - [ ] Check D (Poor Process + Good Result) - FALSE SECURITY alert

- [ ] **F007 - Billing COPQ** ⚠️ CRITICAL
  - [ ] Create COPQ incident with costs
  - [ ] Verify paisa storage (no decimals)
  - [ ] Test arithmetic (₹100.10 + ₹200.20 = ₹300.30 exactly)
  - [ ] Generate dashboard report
  - [ ] Verify no floating-point errors

### Integration Testing

- [ ] Parent can view NPS surveys
- [ ] Parent can view grievance tickets
- [ ] Process instances linked to billing
- [ ] COPQ incidents linked to bills
- [ ] Maturity assessments linked to departments

---

## ROLLBACK PLAN (IF FIXES FAIL)

### Rollback Issue 1 (parent_sessions)
```sql
-- If fix causes issues, remove table:
DROP TABLE IF EXISTS parent_sessions CASCADE;

-- Then investigate root cause in migration file
```

### Rollback Issue 2 (COPQ precision)
```sql
-- If fix causes issues, restore from backup:
DROP TABLE IF EXISTS billing_copq_incidents CASCADE;
ALTER TABLE billing_copq_incidents_backup RENAME TO billing_copq_incidents;

-- Recreate views and functions
-- (Run original migration 20260201110005_create_billing_copq.sql)
```

---

## POST-FIX ACTIONS

After both critical issues are resolved:

### 1. Update TypeScript Types
```bash
cd /Users/omm/PROJECTS/MyJKKN
~/bin/supabase gen types typescript --project-id hhprjbgknupaplivtoib > types/supabase.ts
```

### 2. Update Documentation
- [ ] Document parent_sessions usage
- [ ] Document COPQ paisa conversion (₹1 = 100 paisa)
- [ ] Update API docs with new data types
- [ ] Add examples for COPQ calculations

### 3. Notify Team
- [ ] Notify frontend team about COPQ data type change
- [ ] Update financial calculation logic in frontend
- [ ] Test all money-related features

### 4. Deploy to Production
**⚠️ DO NOT deploy until both critical issues are fixed and tested**

- [ ] Fix issues in staging
- [ ] Full integration test in staging
- [ ] Apply same fixes to production
- [ ] Smoke test in production
- [ ] Monitor for errors

---

## CONTACT FOR ISSUES

If fixes fail or unexpected issues arise:

1. **Check Supabase logs:**
   ```bash
   ~/bin/supabase db logs --project-ref hhprjbgknupaplivtoib
   ```

2. **Review migration history:**
   ```sql
   SELECT version, name, inserted_at
   FROM supabase_migrations.schema_migrations
   ORDER BY inserted_at DESC LIMIT 20;
   ```

3. **Consult documentation:**
   - TQM_MIGRATION_VERIFICATION_REPORT.md
   - SCHEMA_DIFF_REPORT.md

---

## COMPLETION CHECKLIST

Before marking as complete:

- [ ] Both critical issues fixed
- [ ] All verification tests pass
- [ ] TypeScript types regenerated
- [ ] Documentation updated
- [ ] Team notified
- [ ] Production deployment plan ready

**Sign-off:**
- [ ] Database Expert: _________________
- [ ] Backend Lead: _________________
- [ ] QA Lead: _________________

---

**Last Updated:** 2026-02-05
**Status:** ⬜ Not Started | In Progress | ✅ Complete
