# TQM SCHEMA DIFF REPORT

**Database:** Staging (hhprjbgknupaplivtoib)
**Date:** 2026-02-05

---

## CRITICAL DISCREPANCIES

### 1. F003 - Missing `parent_sessions` Table

**EXPECTED** (from migration file):
```sql
CREATE TABLE parent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parent_sessions_parent ON parent_sessions(parent_id);
CREATE INDEX idx_parent_sessions_token ON parent_sessions(session_token);
CREATE INDEX idx_parent_sessions_expires ON parent_sessions(expires_at);

ALTER TABLE parent_sessions ENABLE ROW LEVEL SECURITY;
```

**ACTUAL** (in staging database):
```sql
-- TABLE DOES NOT EXIST
```

**Impact:**
- Parent authentication sessions cannot be stored
- Login state will not persist
- Authentication flow will break

---

### 2. F007 - COPQ Financial Precision Not Fixed

**EXPECTED** (from migration file):
```sql
-- After migration 20260201224034_fix_copq_financial_precision.sql
ALTER TABLE billing_copq_incidents (
  ...
  visible_cost BIGINT NOT NULL,  -- Paisa storage: ₹1 = 100 paisa
  hidden_cost_estimate BIGINT NOT NULL,  -- Paisa storage: ₹1 = 100 paisa
  ...
);
```

**ACTUAL** (in staging database):
```sql
ALTER TABLE billing_copq_incidents (
  ...
  visible_cost NUMERIC(12,2),  -- Still DECIMAL - floating-point precision loss
  hidden_cost_estimate NUMERIC(12,2),  -- Still DECIMAL - floating-point precision loss
  ...
);
```

**Impact:**
- JavaScript floating-point arithmetic errors
- Example: ₹100.10 + ₹200.20 = ₹300.2999999999 (WRONG)
- Financial audit compliance risk
- Accumulated errors in reports

**Expected Behavior:**
- Store money in paisa (100 paisa = ₹1)
- Use integer arithmetic for exact calculations
- Example: 10010 + 20020 = 30030 paisa = ₹300.30 (CORRECT)

---

## SCHEMA VERIFICATION BY FEATURE

### F001: Stakeholder NPS ✅ MATCH

**All tables match expected schema:**
- nps_surveys: 14 columns ✅
- nps_responses: 12 columns ✅
- nps_analytics: 11 columns ✅

**Key Differences:** None

---

### F002: Process Excellence ✅ MATCH

**All tables match expected schema:**
- process_definitions: 11 columns ✅
- process_instances: 10 columns ✅
- waste_incidents: 15 columns ✅
- process_audits: 15 columns ✅

**Key Differences:** None

---

### F003: Parent Portal ❌ MISMATCH

**Tables Match:**
- parent_profiles: 10 columns ✅
- parent_learner_links: 7 columns ✅
- parent_communications: 11 columns ✅
- parent_activity_log: 8 columns ✅
- parent_otp_requests: 7 columns ✅

**Missing Table:**
- **parent_sessions: TABLE DOES NOT EXIST** ❌

**Expected Columns for parent_sessions:**
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PRIMARY KEY |
| parent_id | UUID | NOT NULL, FK to parent_profiles |
| session_token | TEXT | NOT NULL, UNIQUE |
| expires_at | TIMESTAMPTZ | NOT NULL |
| ip_address | INET | NULL |
| user_agent | TEXT | NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Actual:** Table does not exist in database

---

### F004: Grievance System ✅ MATCH

**All tables match expected schema:**
- grievance_categories: 10 columns ✅
- grievance_tickets: 29 columns ✅
- grievance_comments: 8 columns ✅
- grievance_history: 6 columns ✅

**Key Differences:** None

---

### F005: Maturity Assessment ✅ MATCH

**All tables match expected schema:**
- maturity_frameworks: 8 columns ✅
- maturity_assessments: 15 columns ✅
- maturity_progress: 11 columns ✅
- maturity_evidence: 8 columns ✅

**Key Differences:** None

---

### F006: OKR ABCD ✅ MATCH

**Columns added to okr_key_results:**
- process_rating: INTEGER ✅
- process_notes: TEXT ✅
- abcd_category: VARCHAR(1) GENERATED ✅

**Key Differences:** None

---

### F007: Billing COPQ ❌ MISMATCH

**Table Exists:** billing_copq_incidents ✅

**Column Mismatch:**

| Column | Expected Type | Actual Type | Status |
|--------|---------------|-------------|--------|
| visible_cost | **BIGINT** | NUMERIC(12,2) | ❌ MISMATCH |
| hidden_cost_estimate | **BIGINT** | NUMERIC(12,2) | ❌ MISMATCH |

**All Other Columns:** Match expected schema ✅

---

## FUNCTION COMPARISON

### Expected vs Actual

| Feature | Expected Functions | Actual Functions | Status |
|---------|-------------------|------------------|--------|
| F001 - NPS | 3 | 3 | ✅ MATCH |
| F002 - Process | 3 | 3 | ✅ MATCH |
| F003 - Parent | 8 | 8 | ✅ MATCH |
| F004 - Grievance | 5 | 5 | ✅ MATCH |
| F005 - Maturity | 4 | 4 | ✅ MATCH |
| F006 - OKR ABCD | 2 | 2 | ✅ MATCH |
| F007 - COPQ | 1 | 1 | ⚠️ Function exists but expects wrong data type |

---

## INDEX COMPARISON

### Expected vs Actual

| Feature | Expected Indexes | Actual Indexes | Status |
|---------|-----------------|----------------|--------|
| F001 - NPS | 15 | 15 | ✅ MATCH |
| F002 - Process | 23 | 23 | ✅ MATCH |
| F003 - Parent | ~15 | ~12 | ❌ Missing 3 indexes for parent_sessions |
| F004 - Grievance | 21 | 21 | ✅ MATCH |
| F005 - Maturity | 15 | 15 | ✅ MATCH |
| F006 - OKR ABCD | 2 | 2 | ✅ MATCH |
| F007 - COPQ | 9 | 9 | ✅ MATCH |

---

## RLS POLICY COMPARISON

All tables have RLS enabled ✅

| Feature | Tables with RLS | Status |
|---------|----------------|--------|
| F001 - NPS | 3/3 | ✅ MATCH |
| F002 - Process | 4/4 | ✅ MATCH |
| F003 - Parent | 5/6 | ❌ Missing RLS for parent_sessions |
| F004 - Grievance | 4/4 | ✅ MATCH |
| F005 - Maturity | 4/4 | ✅ MATCH |
| F006 - OKR ABCD | N/A (columns only) | ✅ N/A |
| F007 - COPQ | 1/1 | ✅ MATCH |

---

## ENUM COMPARISON

### Expected Enums

| Enum Name | Expected Values | Actual Values | Status |
|-----------|-----------------|---------------|--------|
| stakeholder_type | parent, learner, alumni, industry, staff | ✅ Present | ✅ MATCH |
| survey_status | draft, active, closed, archived | ✅ Present | ✅ MATCH |
| nps_category | promoter, passive, detractor | ✅ Present | ✅ MATCH |
| parent_relationship | father, mother, guardian, other | ✅ Present | ✅ MATCH |
| communication_type | announcement, message, alert | ✅ Present | ✅ MATCH |
| parent_activity_type | login, view_dashboard, ... (8 values) | ✅ Present | ✅ MATCH |

---

## TRIGGER COMPARISON

### Expected vs Actual

| Feature | Expected Triggers | Verified | Status |
|---------|------------------|----------|--------|
| F001 - NPS | 2 (update analytics, update timestamp) | ✅ | ✅ MATCH |
| F002 - Process | 3 (SLA, metrics, timestamp) | ✅ | ✅ MATCH |
| F003 - Parent | 3 (timestamp, single primary, cleanup OTP) | ⚠️ | ⚠️ Cleanup trigger may be missing |
| F004 - Grievance | 3 (ticket number, SLA, timestamp) | ✅ | ✅ MATCH |
| F005 - Maturity | 2 (calculate stage, timestamp) | ✅ | ✅ MATCH |
| F006 - OKR ABCD | 0 (uses generated column) | ✅ | ✅ MATCH |
| F007 - COPQ | 1 (update timestamp) | ✅ | ✅ MATCH |

---

## VIEW COMPARISON

### Expected vs Actual

| View Name | Feature | Status |
|-----------|---------|--------|
| billing_copq_summary | F007 | ✅ Present |
| billing_copq_yearly_totals | F007 | ✅ Present |
| maturity_dashboard_summary | F005 | ✅ Present |
| okr_abcd_analysis | F006 | ✅ Present |

---

## SUMMARY OF DIFFERENCES

### Missing Objects

| Object Type | Name | Feature | Impact |
|-------------|------|---------|--------|
| Table | parent_sessions | F003 | **CRITICAL** - Authentication will fail |
| Index | idx_parent_sessions_parent | F003 | **CRITICAL** - Required for session lookup |
| Index | idx_parent_sessions_token | F003 | **CRITICAL** - Required for session validation |
| Index | idx_parent_sessions_expires | F003 | **CRITICAL** - Required for session cleanup |

### Data Type Mismatches

| Table | Column | Expected | Actual | Impact |
|-------|--------|----------|--------|--------|
| billing_copq_incidents | visible_cost | BIGINT | NUMERIC(12,2) | **CRITICAL** - Precision loss |
| billing_copq_incidents | hidden_cost_estimate | BIGINT | NUMERIC(12,2) | **CRITICAL** - Precision loss |

### Other Discrepancies

None identified. All other schema objects match expected definitions.

---

## MIGRATION FILE ANALYSIS

### Successfully Applied Migrations

| Migration | Status | Notes |
|-----------|--------|-------|
| 20260201110000_create_nps_tables | ✅ Applied | All objects created |
| 20260201110001_create_parent_portal_tables | ⚠️ Partial | Missing parent_sessions |
| 20260201110002_create_grievance_tables | ✅ Applied | All objects created |
| 20260201110003_create_maturity_assessment_tables | ✅ Applied | All objects created |
| 20260201110004_extend_okr_abcd | ✅ Applied | All objects created |
| 20260201110005_create_billing_copq | ✅ Applied | All objects created |
| 20260201110006_create_process_excellence_tables | ✅ Applied | All objects created |
| 20260201224034_fix_copq_financial_precision | ❌ Failed | Data type not changed |

### Problematic Migrations

1. **20260201100002_create_parent_sessions.sql**
   - Listed as applied in migration history
   - Table does not exist in database
   - Possible causes: Empty file, syntax error, rolled back

2. **20260201224034_fix_copq_financial_precision.sql**
   - Listed as applied in migration history
   - Data type change not applied
   - Possible causes: Type conversion failed, rolled back

### Duplicate Migrations (Possible Conflict)

| Original | Duplicate | Notes |
|----------|-----------|-------|
| 20260201110000_create_nps_tables | 20260202100001_create_nps_tables | May cause conflicts |
| 20260201110001_create_parent_portal_tables | 20260202000000_create_parent_portal_tables | May cause conflicts |

---

## RECOMMENDED FIXES

### Fix 1: Create parent_sessions Table

```sql
-- Manually create the missing table
CREATE TABLE IF NOT EXISTS parent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parent_profiles(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_parent_sessions_parent ON parent_sessions(parent_id);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_token ON parent_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_expires ON parent_sessions(expires_at);

-- Enable RLS
ALTER TABLE parent_sessions ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Parents can view own sessions"
  ON parent_sessions FOR SELECT
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Parents can create own sessions"
  ON parent_sessions FOR INSERT
  WITH CHECK (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));

CREATE POLICY "Parents can delete own sessions"
  ON parent_sessions FOR DELETE
  USING (parent_id IN (
    SELECT id FROM parent_profiles WHERE user_id = auth.uid()
  ));
```

### Fix 2: Apply COPQ Financial Precision Fix

```sql
-- Add new columns with BIGINT type (paisa)
ALTER TABLE billing_copq_incidents
  ADD COLUMN visible_cost_paisa BIGINT DEFAULT 0,
  ADD COLUMN hidden_cost_estimate_paisa BIGINT DEFAULT 0;

-- Migrate existing data (convert rupees to paisa)
UPDATE billing_copq_incidents
SET
  visible_cost_paisa = ROUND(visible_cost * 100)::BIGINT,
  hidden_cost_estimate_paisa = ROUND(hidden_cost_estimate * 100)::BIGINT;

-- Drop old DECIMAL columns
ALTER TABLE billing_copq_incidents
  DROP COLUMN visible_cost,
  DROP COLUMN hidden_cost_estimate;

-- Rename new columns to original names
ALTER TABLE billing_copq_incidents
  RENAME COLUMN visible_cost_paisa TO visible_cost;

ALTER TABLE billing_copq_incidents
  RENAME COLUMN hidden_cost_estimate_paisa TO hidden_cost_estimate;

-- Add constraints
ALTER TABLE billing_copq_incidents
  ALTER COLUMN visible_cost SET NOT NULL,
  ALTER COLUMN hidden_cost_estimate SET NOT NULL,
  ADD CONSTRAINT visible_cost_positive CHECK (visible_cost >= 0),
  ADD CONSTRAINT hidden_cost_positive CHECK (hidden_cost_estimate >= 0);

-- Update comments
COMMENT ON COLUMN billing_copq_incidents.visible_cost IS 'Visible cost in paisa (₹1 = 100 paisa). Use integer arithmetic to prevent precision loss.';
COMMENT ON COLUMN billing_copq_incidents.hidden_cost_estimate IS 'Hidden cost in paisa (₹1 = 100 paisa). Use integer arithmetic to prevent precision loss.';
```

---

## VERIFICATION QUERIES

After applying fixes, run these queries to verify:

### Verify parent_sessions Table

```sql
-- Check table exists
SELECT COUNT(*) as table_exists
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'parent_sessions';

-- Check columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'parent_sessions'
ORDER BY ordinal_position;

-- Check indexes
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'parent_sessions';

-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'parent_sessions';
```

### Verify COPQ Precision Fix

```sql
-- Check data types
SELECT
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'billing_copq_incidents'
AND column_name IN ('visible_cost', 'hidden_cost_estimate');

-- Expected output:
-- visible_cost | bigint | null | null
-- hidden_cost_estimate | bigint | null | null

-- Test arithmetic precision
SELECT
  10010 + 20020 as correct_paisa_sum,  -- Should be 30030 (₹300.30)
  (10010 + 20020) / 100.0 as rupees;   -- Should be 300.30
```

---

**Report Generated:** 2026-02-05
**Database:** hhprjbgknupaplivtoib (Staging)
**Comparison Method:** Migration Files vs Actual Schema
