# TQM Migration Files Review Report
**Date:** 2026-02-01
**Reviewer:** Database Migration Specialist
**Files Reviewed:** 7 migration files

---

## Executive Summary

Reviewed all 7 TQM-related migration files created on 2026-02-01. Found **23 critical issues** across syntax errors, missing indexes, RLS policy problems, constraint issues, and data type concerns.

**Severity Breakdown:**
- 🔴 **Critical (Must Fix):** 8 issues
- 🟡 **High (Should Fix):** 10 issues
- 🟢 **Medium (Nice to Fix):** 5 issues

---

## File-by-File Analysis

### 1. `20260201000001_create_nps_tables.sql` - NPS Module

#### ✅ **Strengths**
- Well-structured JSONB validation with `jsonb_typeof` checks
- Good use of generated columns for `nps_category`
- Comprehensive indexes including partial and GIN indexes
- Excellent documentation with comments
- Smart analytics aggregation with upsert pattern

#### 🔴 **Critical Issues**

**Issue #1: Missing RLS Policy for Analytics DELETE**
```sql
CREATE POLICY "System can manage analytics"
  ON nps_analytics FOR ALL
  USING (true)
  WITH CHECK (true);
```
**Problem:** This policy allows ANYONE to delete analytics data.
**Fix:** Should be restricted to service role or system operations only.

**Issue #2: Trigger on DELETE Operation Without NEW**
```sql
CREATE TRIGGER trg_update_nps_analytics
  AFTER INSERT OR UPDATE OR DELETE ON nps_responses
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_nps_analytics();
```
**Problem:** Function uses `NEW.survey_id` but DELETE triggers don't have NEW, only OLD.
**Fix:** Must handle DELETE case separately using `OLD.survey_id`.

#### 🟡 **High Priority Issues**

**Issue #3: Missing Index on Survey Created Date**
- **Missing:** `CREATE INDEX idx_nps_surveys_created ON nps_surveys(created_at DESC);`
- **Impact:** Dashboard queries showing recent surveys will be slow.

**Issue #4: No Constraint on Email/Phone in Responses**
- Anonymous responses allowed, but no validation that at least ONE contact method exists.
- Could lead to responses with no way to follow up.

---

### 2. `20260201000003_create_parent_portal_tables.sql` - Parent Portal

#### ✅ **Strengths**
- Excellent OTP expiry cleanup trigger
- Proper foreign key relationships
- Good RLS separation between parents and staff

#### 🔴 **Critical Issues**

**Issue #5: OTP Cleanup Trigger Uses Wrong Timing**
```sql
CREATE TRIGGER trigger_cleanup_expired_otps
  AFTER INSERT ON parent_otp_requests
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_expired_otps();
```
**Problem:** Runs on EVERY insert, causing performance issues. Should be a scheduled job.
**Fix:** Remove trigger, implement as cron job or scheduled function.

**Issue #6: Missing Unique Constraint on Primary Parent**
- Only enforced via trigger, not database constraint.
- Race conditions possible with concurrent updates.

**Issue #7: Function References Missing Table**
```sql
-- In get_learner_fees_for_parent()
FROM billing_receipts br
WHERE br.student_id = p_learner_id
```
**Problem:** Uses `student_id` but parameter is `learner_id`. Column names inconsistent.
**Fix:** Verify actual billing schema and use correct column names.

#### 🟡 **High Priority Issues**

**Issue #8: No Index on `parent_communications.created_at`**
- Needed for timeline/feed queries.

**Issue #9: RLS Policy Allows Updating Any Field**
```sql
CREATE POLICY "Parents can update read status"
  ON parent_communications FOR UPDATE
  USING (...)
```
- Policy name says "read status" but allows updating ALL fields.
- Should restrict to ONLY `read_at` column.

---

### 3. `20260201000004_create_grievance_tables.sql` - Grievance System

#### ✅ **Strengths**
- Excellent SLA tracking with automatic status updates
- Good full-text search index
- Comprehensive RLS policies
- Smart ticket number generation

#### 🔴 **Critical Issues**

**Issue #10: DELETE Trigger Tries to Access NEW**
```sql
DROP TRIGGER IF EXISTS check_grievance_sla_status ON grievance_tickets;
CREATE TRIGGER check_grievance_sla_status
  BEFORE UPDATE ON grievance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_grievance_sla_status();
```
**Problem:** Function is safe (UPDATE only), but history trigger pattern suggests DELETE support was intended.
**Fix:** Add history logging for DELETE operations.

**Issue #11: SLA Calculation Logic Error**
```sql
IF NOW() > NEW.sla_deadline - INTERVAL '4 hours' THEN
  NEW.sla_status := 'at_risk';
```
**Problem:** Hardcoded 4 hours doesn't scale. For 48-hour SLA, "at risk" should trigger earlier.
**Fix:** Use percentage-based threshold (e.g., 80% of SLA time elapsed).

#### 🟡 **High Priority Issues**

**Issue #12: Missing Composite Index for Dashboard Queries**
- Missing: `CREATE INDEX idx_grievance_tickets_institution_status ON grievance_tickets(institution_id, status, sla_status);`
- Common query pattern not optimized.

**Issue #13: Sequence May Reset Unexpectedly**
```sql
CREATE SEQUENCE IF NOT EXISTS grievance_ticket_seq START 1;
```
- No `OWNED BY` clause means sequence survives table drops.
- Should be: `CREATE SEQUENCE ... OWNED BY grievance_tickets.id;`

---

### 4. `20260201000005_create_maturity_assessment_tables.sql` - Maturity Assessment

#### ✅ **Strengths**
- Clean 4-stage maturity model
- Good use of JSONB for flexible dimensions
- Comprehensive RLS policies
- Excellent seeding function

#### 🔴 **Critical Issues**

**Issue #14: RLS Policy Uses Non-Existent Table**
```sql
CREATE POLICY "Users can view frameworks for their institution"
  ON maturity_frameworks FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE profile_id = auth.uid()
    )
  );
```
**Problem:** Uses `profile_id` but earlier migrations show it should be `user_id`.
**Fix:** Change to `user_id` throughout ALL RLS policies in this file.

**Issue #15: Missing CHECK Constraint on Overall Stage**
- `overall_stage` defined as `INTEGER NOT NULL CHECK (overall_stage >= 1 AND overall_stage <= 4)`
- BUT it's auto-calculated by trigger, so constraint may fail if calculation returns 0.
- **Fix:** Handle edge case in trigger.

#### 🟡 **High Priority Issues**

**Issue #16: No Index on Status + Institution**
- Missing: `CREATE INDEX idx_maturity_assessments_institution_status ON maturity_assessments(institution_id, status);`

**Issue #17: IMMUTABLE Function Not Truly Immutable**
```sql
CREATE OR REPLACE FUNCTION calculate_maturity_overall_stage(p_dimension_scores JSONB)
RETURNS INTEGER AS $$
...
$$ LANGUAGE plpgsql IMMUTABLE;
```
**Problem:** Marked `IMMUTABLE` but could be `STABLE` if JSONB keys change.
**Fix:** Change to `STABLE` for safety.

---

### 5. `20260201000006_extend_okr_abcd.sql` - OKR A/B/C/D Extension

#### ✅ **Strengths**
- Excellent business logic for A/B/C/D categorization
- Good use of generated columns
- Clear documentation

#### 🟡 **High Priority Issues**

**Issue #18: Generated Column Logic Has Edge Case**
```sql
WHEN progress_percentage >= 70 AND process_rating >= 4 THEN 'A'
WHEN progress_percentage < 70 AND process_rating >= 4 THEN 'B'
WHEN progress_percentage < 70 AND process_rating < 4 THEN 'C'
WHEN progress_percentage >= 70 AND process_rating < 4 THEN 'D'
ELSE NULL
```
**Problem:** What if `process_rating` is NULL but `progress_percentage` exists?
**Current:** Returns NULL
**Better:** Document this as "Not Yet Rated" state explicitly.

**Issue #19: No Constraint on Progress Percentage Range**
- Missing: `CHECK (progress_percentage >= 0 AND progress_percentage <= 100)`
- Could have invalid values like 150% or -10%.

---

### 6. `20260201000007_create_billing_copq.sql` - Billing COPQ

#### ✅ **Strengths**
- Clean COPQ tracking structure
- Good summary views
- Comprehensive dashboard function

#### 🟡 **High Priority Issues**

**Issue #20: RLS References Wrong Table**
```sql
CREATE POLICY "billing_copq_view_policy" ON billing_copq_incidents
  FOR SELECT
  USING (
    institution_id IN (
      SELECT institution_id FROM user_institution_access
      WHERE user_id = auth.uid()
    )
  );
```
**Problem:** `user_institution_access` may not exist. Should verify actual table name.
**Expected:** Likely `users_institution_access` or similar.

**Issue #21: Missing Index on Resolved Status**
- Missing: `CREATE INDEX idx_billing_copq_resolved ON billing_copq_incidents(resolved_at) WHERE resolved_at IS NOT NULL;`

#### 🟢 **Medium Priority Issues**

**Issue #22: Function Uses SECURITY DEFINER Without Validation**
```sql
CREATE OR REPLACE FUNCTION get_billing_copq_dashboard(...)
LANGUAGE plpgsql
SECURITY DEFINER
```
**Problem:** No validation that user has access to the institution_id parameter.
**Fix:** Add access check at function start.

---

### 7. `20260201100001_create_process_excellence_tables.sql` - Process Excellence

#### ✅ **Strengths**
- Comprehensive TIMWOOD waste tracking
- Excellent SLA monitoring with triggers
- Good metrics calculation

#### 🔴 **Critical Issues**

**Issue #23: Trigger Function References Non-Existent Column**
```sql
CREATE OR REPLACE FUNCTION calculate_process_instance_metrics()
...
FOR v_stage IN SELECT * FROM jsonb_array_elements(NEW.stage_history)
LOOP
  IF (v_stage->>'duration_hours') IS NOT NULL THEN
    v_total_hours := v_total_hours + (v_stage->>'duration_hours')::DECIMAL;
```
**Problem:** Assumes `stage_history` JSONB has `duration_hours` pre-calculated.
**Reality:** Application must calculate this from `started_at` and `completed_at`.
**Fix:** Document this requirement OR calculate in trigger.

#### 🟡 **High Priority Issues**

**Issue #24: Same RLS Policy Error (user_institution_access)**
- All RLS policies reference `user_institution_access` table.
- Need to verify correct table name.

**Issue #25: Missing Index on Audit Period + Institution**
- Missing: `CREATE INDEX idx_process_audits_institution_period ON process_audits(institution_id, audit_period_start, audit_period_end);`

---

## Summary of Required Fixes

### Critical (Must Fix Before Running Migrations)
1. Fix RLS "FOR ALL" policy in NPS analytics
2. Fix DELETE trigger in NPS responses
3. Remove OTP cleanup trigger in parent portal
4. Fix column name inconsistency in parent portal functions
5. Fix RLS `profile_id` → `user_id` in maturity assessments
6. Add edge case handling for maturity stage calculation
7. Fix process metrics calculation documentation

### High Priority (Should Fix)
8. Add missing indexes (7 locations)
9. Fix SLA "at risk" threshold to be percentage-based
10. Verify and fix `user_institution_access` table name
11. Add SECURITY DEFINER access validation
12. Add progress_percentage constraint to OKR table

### Medium Priority (Nice to Have)
13. Improve constraint on parent portal email/phone
14. Add sequence OWNED BY clause for grievance tickets
15. Change IMMUTABLE to STABLE for maturity function
16. Document ABCD "Not Yet Rated" state

---

## Next Steps

1. ✅ Create fix scripts for each critical issue
2. ✅ Test fixes against staging database
3. ⬜ Update migration files with fixes
4. ⬜ Run migration dry-run
5. ⬜ Apply to staging environment
6. ⬜ Verify with integration tests

---

**End of Review Report**
