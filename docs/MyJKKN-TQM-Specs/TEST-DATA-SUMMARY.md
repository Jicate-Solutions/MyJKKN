# MyJKKN TQM Modules - Test Data Summary

**Created:** 2025-02-05
**Database:** Staging (hhprjbgknupaplivtoib)
**Status:** Ready for execution

---

## Overview

Comprehensive test data SQL script created for all 7 TQM modules with realistic, production-like data.

## Data Created

### F001: Stakeholder NPS
| Item | Count | Details |
|------|-------|---------|
| **Surveys** | 2 | 1 for students (learner), 1 for parents |
| **Responses** | 23 total | Student: 15 responses (5 promoters, 4 passives, 6 detractors)<br>Parent: 8 responses (3 promoters, 2 passives, 3 detractors) |
| **Analytics** | 2 | Pre-calculated NPS scores for both surveys |

**NPS Scores Generated:**
- Student Survey: NPS = -6.67 (5 promoters - 6 detractors) / 15 * 100
- Parent Survey: NPS = 0 (3 promoters - 3 detractors) / 8 * 100

**Feedback Variety:**
- Promoters: Positive about teaching quality, infrastructure, placement
- Passives: Generally satisfied but highlight areas for improvement
- Detractors: Critical of infrastructure, admin efficiency, hostel facilities

---

### F002: Process Excellence
| Item | Count | Details |
|------|-------|---------|
| **Process Definitions** | 3 | Admission, Billing, Academic Certificate |
| **Process Instances** | 5 | Mix of completed and in-progress |
| **Waste Incidents** | 11 | Cover ALL TIMWOOD categories |
| **Process Audits** | 2 | 1 for admission (C-grade), 1 for billing (D-grade) |

**TIMWOOD Coverage (11 incidents):**
- **T** (Transportation): 2 incidents - physical visits, document transport
- **I** (Inventory): 1 incident - paper form backlog
- **M** (Motion): 1 incident - walking for signatures
- **W** (Waiting): 2 incidents - approval delays, payment waiting
- **O1** (Over-production): 1 incident - premature invoice generation
- **O2** (Over-processing): 1 incident - manual payment verification
- **D** (Defects): 2 incidents - invoice errors, certificate mistakes
- **TU** (Talent Under-utilization): 1 incident - senior staff on admin tasks

**Process Instance States:**
- 2 completed (1 on-track, 1 SLA breached)
- 3 in-progress (1 on-track, 1 at-risk, 1 breached)

**Audit Ratings:**
- Admission Process: **C-grade** (Good process, bad result - needs investigation)
- Billing Process: **D-grade** (Bad process, good result - FALSE SECURITY warning)

---

### F003: Parent Portal
| Item | Count | Details |
|------|-------|---------|
| **Parent Profiles** | 3 | With phone, email, relationship info |
| **Parent-Learner Links** | 4 | 1 learner with 2 parents, others with 1 each |
| **Communications** | 6 | Mix of announcements, alerts, messages |

**Parent Accounts:**
1. Rajesh Kumar (father) - +919876543210
2. Priya Sharma (mother) - +919876543211
3. Suresh Patel (father) - +919876543212

**Communication Types:**
- 2 announcements (exam schedule, college fest)
- 2 alerts (fee due, low attendance)
- 2 messages (PTM invitation, performance update)

**Read Status:**
- 3 read (with timestamps)
- 3 unread

---

### F004: Grievance System
| Item | Count | Details |
|------|-------|---------|
| **Categories** | 5 | Academic, Administrative, Facility, Fee & Billing, Other |
| **Tickets** | 10 | Various stages and SLA statuses |
| **Comments** | 5 | Mix of staff and student comments |
| **History Entries** | 5 | Tracking status changes and assignments |

**Ticket Distribution by Status:**
- **Open:** 2 tickets (1 on-track, 1 breached)
- **In Progress:** 2 tickets (1 at-risk, 1 breached)
- **Pending Info:** 1 ticket (breached)
- **Resolved:** 2 tickets (both on-track)
- **Closed:** 2 tickets (both on-track, with satisfaction ratings)
- **Reopened:** 1 ticket (breached, dissatisfied with resolution)

**SLA Tracking:**
- **On-track:** 4 tickets
- **At-risk:** 1 ticket
- **Breached:** 5 tickets

**Satisfaction Ratings (closed tickets):**
- 2 tickets rated 4/5
- 2 tickets rated 5/5

**Ticket Numbers:** GRV-20250205-0001 through GRV-20250120-0010

---

### F005: Maturity Assessment
| Item | Count | Details |
|------|-------|---------|
| **Frameworks** | 1 | Excellence Journey (5 dimensions) |
| **Assessments** | 3 | Showing progression over time |
| **Progress Items** | 7 | Action items with various statuses |

**Maturity Dimensions:**
1. Leadership
2. Strategy
3. Process
4. People
5. Stakeholders

**Assessment Progression:**

| Date | Overall Stage | Status | Notes |
|------|---------------|--------|-------|
| June 2024 | **Stage 1: Crisis** | Approved | Reactive mode, no planning |
| Dec 2024 | **Stage 2: Survival** | Submitted | Basic plans, some docs |
| Jan 2025 | **Stage 3: Stability** | Draft | Strategic vision, standardized |

**Target:** Move to Stage 4 (Excellence) by Dec 2025

**Progress Tracking:**
- 4 completed items (from Stage 1 → 2 transition)
- 2 in-progress items (Stage 2 → 3 transition)
- 1 pending item (future work)

---

### F006: OKR ABCD Matrix
| Item | Count | Details |
|------|-------|---------|
| **Objectives** | 2 | Student Satisfaction, Academic Quality |
| **Key Results** | 12 | Distributed across A/B/C/D categories |

**ABCD Distribution:**

| Category | Count | Interpretation | Examples |
|----------|-------|----------------|----------|
| **A** | 3 | Good Process + Good Result → Replicate | NPS score improvement, complaint resolution, faculty training |
| **B** | 3 | Bad Process + Bad Result → Improve | Fee refunds, hostel satisfaction, lab utilization |
| **C** | 3 | Good Process + Bad Result → Investigate | Digital library adoption, pass percentage, research publications |
| **D** | 3 | Bad Process + Good Result → **⚠️ FALSE SECURITY** | Placement rate, internal assessments, fee defaults |

**Critical D-Category Alerts:**
- Placement rate high but unsystematic process
- Internal assessment scores high but inconsistent standards
- Low fee defaults but unsustainable aggressive follow-up

**Process Ratings:**
- Rating 5: Excellent (2 KRs)
- Rating 4: Good (4 KRs)
- Rating 3: Average (3 KRs)
- Rating 2: Poor (3 KRs)

---

### F007: Billing COPQ (Cost of Poor Quality)
| Item | Count | Details |
|------|-------|---------|
| **COPQ Incidents** | 16 | Cover all 10 categories |

**Category Distribution:**

| Category | Count | Total Visible Cost | Total Hidden Cost | Example |
|----------|-------|-------------------|-------------------|---------|
| Refund Processing | 2 | ₹40,000 | ₹8,000 | Manual approvals, duplicate refunds |
| Late Payment Follow-up | 2 | ₹2,000 | ₹12,000 | Manual calls, physical letters |
| Invoice Error | 2 | ₹0 | ₹3,500 | Wrong amounts, missing discounts |
| Payment Reconciliation | 2 | ₹0 | ₹13,000 | Manual bank matching, delayed updates |
| Discount Dispute | 2 | ₹5,000 | ₹5,000 | Scholarship not applied, sibling discount issues |
| Collection Cost | 1 | ₹15,000 | ₹8,000 | Legal notices |
| Bad Debt | 1 | ₹75,000 | ₹10,000 | Student dropout with unpaid fees |
| Reputation Impact | 2 | ₹0 | ₹40,000 | Social media complaints, negative reviews |
| Process Rework | 1 | ₹0 | ₹3,000 | Incorrect receipt format |
| Other | 1 | ₹0 | ₹800 | Mobile compatibility issues |

**Cost Summary:**
- **Total Visible Cost:** ₹1,37,000
- **Total Hidden Cost:** ₹1,03,300
- **Total COPQ:** ₹2,40,300
- **Average Time Lost:** 136 hours across 16 incidents

**Status Distribution:**
- Logged: 4 incidents
- Investigating: 5 incidents
- Resolved: 6 incidents
- Written Off: 1 incident

---

## Test User Credentials

### Existing Test Account (from staging database)

| Field | Value |
|-------|-------|
| **Email** | test-superadmin@jkkn.local |
| **Password** | SuperAdmin@123 |
| **Role** | super_admin |
| **Database** | Staging (hhprjbgknupaplivtoib.supabase.co) |
| **Access** | Full system access |

**Login URL:** https://myjkkn-omm-dev.vercel.app/auth/login

**Steps to login:**
1. Click "Sign in with Email (Test Accounts)"
2. Use credentials above

---

## Data Relationship Map

```
institutions (root)
    └── departments
    └── programs
    └── users_profiles (admin, staff)
    └── learners_profiles
    └── auth.users
        └── parent_profiles
            └── parent_learner_links → learners_profiles
            └── parent_communications

    └── nps_surveys
        └── nps_responses
        └── nps_analytics

    └── process_definitions
        └── process_instances
            └── waste_incidents
        └── process_audits

    └── grievance_categories
        └── grievance_tickets
            └── grievance_comments
            └── grievance_history

    └── maturity_frameworks
        └── maturity_assessments
            └── maturity_progress

    └── okr_objectives
        └── okr_key_results (with process_rating, abcd_category)

    └── billing_copq_incidents
```

---

## Execution Instructions

### Prerequisites

1. **Docker Running**: Required for Supabase CLI
   ```bash
   # Check Docker status
   docker info
   ```

2. **Supabase CLI Authenticated**
   ```bash
   ~/bin/supabase projects list
   # Should show: hhprjbgknupaplivtoib (staging)
   ```

### Method 1: Execute via Supabase Dashboard (Recommended)

1. Open Staging Dashboard:
   ```
   https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/editor
   ```

2. Go to **SQL Editor** → **New Query**

3. Copy entire contents of `test-data-comprehensive.sql`

4. Click **Run** (or press Cmd+Enter)

5. Check console output for success messages

**Expected Output:**
```
NOTICE:  Using Institution ID: <uuid>
NOTICE:  Using Admin User ID: <uuid>
NOTICE:  Creating NPS test data...
NOTICE:  NPS data created: 2 surveys, 23 responses
NOTICE:  Creating Process Excellence test data...
NOTICE:  Process Excellence data created: 3 processes, 5 instances, 11 waste incidents, 2 audits
...
NOTICE:  TEST DATA CREATION COMPLETE
NOTICE:  F001 NPS: 2 surveys, 23 responses
NOTICE:  F002 Process: 3 processes, 5 instances, 11 waste incidents, 2 audits
NOTICE:  F003 Parent: 3 parents, 4 links, 6 communications
NOTICE:  F004 Grievance: 5 categories, 10 tickets, 5 comments
NOTICE:  F005 Maturity: 1 framework, 3 assessments, 7 progress items
NOTICE:  F006 OKR ABCD: 2 objectives, 12 key results
NOTICE:  F007 COPQ: 16 incidents
```

### Method 2: Execute via Supabase CLI

```bash
# Navigate to project
cd /Users/omm/PROJECTS/MyJKKN

# Get staging database URL (from .env.local or Supabase dashboard)
# Format: postgresql://postgres:[password]@[host]:5432/postgres

# Execute SQL file
~/bin/supabase db execute --file docs/MyJKKN-TQM-Specs/test-data-comprehensive.sql \
  --db-url "postgresql://postgres:[YOUR_PASSWORD]@[STAGING_HOST]:5432/postgres"
```

**Note:** You'll need to get the staging database password from `.env.local` or Supabase dashboard.

### Method 3: Execute via psql (Alternative)

```bash
# If you have psql installed
psql "postgresql://postgres:[password]@[staging-host]:5432/postgres" \
  -f docs/MyJKKN-TQM-Specs/test-data-comprehensive.sql
```

---

## Verification Steps

After execution, verify data in Supabase Dashboard:

### 1. Verify NPS Data
```sql
-- Check surveys
SELECT COUNT(*) FROM nps_surveys WHERE institution_id = '<your-institution-id>';
-- Expected: 2

-- Check responses
SELECT nps_category, COUNT(*)
FROM nps_responses
GROUP BY nps_category;
-- Expected: promoter (8), passive (6), detractor (9)
```

### 2. Verify Process Data
```sql
-- Check processes
SELECT category, COUNT(*)
FROM process_definitions
GROUP BY category;
-- Expected: admission (1), billing (1), academic (1)

-- Check waste incidents by category
SELECT waste_category, COUNT(*)
FROM waste_incidents
GROUP BY waste_category
ORDER BY waste_category;
-- Expected: All 8 TIMWOOD categories represented
```

### 3. Verify Grievance Data
```sql
-- Check ticket status distribution
SELECT status, COUNT(*)
FROM grievance_tickets
GROUP BY status;
-- Expected: open (2), in_progress (2), pending_info (1), resolved (2), closed (2), reopened (1)

-- Check SLA status
SELECT sla_status, COUNT(*)
FROM grievance_tickets
GROUP BY sla_status;
-- Expected: on_track (4), at_risk (1), breached (5)
```

### 4. Verify OKR ABCD Data
```sql
-- Check ABCD distribution
SELECT abcd_category, COUNT(*)
FROM okr_key_results
WHERE abcd_category IS NOT NULL
GROUP BY abcd_category;
-- Expected: A (3), B (3), C (3), D (3)
```

### 5. Verify COPQ Data
```sql
-- Check COPQ by category
SELECT category, COUNT(*),
       SUM(visible_cost) as total_visible,
       SUM(hidden_cost_estimate) as total_hidden
FROM billing_copq_incidents
GROUP BY category;
-- Expected: All 10 categories, total visible ~137k, total hidden ~103k
```

---

## Troubleshooting

### Issue: "Institution ID not found"
**Solution:** The script automatically gets the first institution. If no institutions exist, you need to create one first or modify the script with a specific institution ID.

### Issue: "User ID not found"
**Solution:** Script uses existing users. Make sure you have at least one user in users_profiles table. The test-superadmin@jkkn.local account should exist.

### Issue: "Foreign key constraint violation"
**Solution:** Ensure prerequisite tables exist (institutions, departments, programs, learners_profiles). These should be created by the main schema setup.

### Issue: "OKR tables do not exist"
**Solution:** This is expected if OKR module isn't set up yet. The script will skip OKR ABCD data creation and continue with others.

### Issue: "Column process_rating does not exist"
**Solution:** Script automatically adds this column. If it fails, manually run:
```sql
ALTER TABLE okr_key_results ADD COLUMN process_rating INTEGER CHECK (process_rating >= 1 AND process_rating <= 5);
ALTER TABLE okr_key_results ADD COLUMN process_notes TEXT;
```

---

## Next Steps After Data Creation

1. **Test Frontend UI**: Access staging app at https://myjkkn-omm-dev.vercel.app

2. **Verify Each Module**:
   - F001: Navigate to `/stakeholder-nps` - should show 2 surveys with responses
   - F002: Navigate to `/process-excellence` - should show 3 processes
   - F003: Navigate to `/parent-portal` - login as parent to see dashboard
   - F004: Navigate to `/grievance` - should show 10 tickets
   - F005: Navigate to `/maturity-assessment` - should show 3 assessments
   - F006: Navigate to OKR module - should show ABCD matrix
   - F007: Navigate to billing module - should show COPQ dashboard

3. **Browser Testing**: Use `/browser-test` skill to test each module thoroughly

4. **Performance Testing**: Check query performance with realistic data volumes

5. **Export Data**: If needed, export test data for other environments
   ```bash
   ~/bin/supabase db dump --data-only > test-data-export.sql
   ```

---

## Files Created

| File | Purpose |
|------|---------|
| `test-data-comprehensive.sql` | Main SQL script with all test data |
| `TEST-DATA-SUMMARY.md` | This document - execution guide and summary |

---

## Success Criteria

✅ All modules have realistic test data
✅ Data covers all major scenarios (success, failure, edge cases)
✅ Relationships between entities are properly linked
✅ ABCD matrix shows distribution across all 4 categories
✅ COPQ data demonstrates hidden vs visible costs
✅ Grievance tickets show various SLA statuses
✅ Process excellence includes all TIMWOOD waste types
✅ Maturity assessment shows progression over time
✅ NPS data includes promoters, passives, and detractors
✅ Parent portal has linked learners and communications

---

**Document Created:** 2025-02-05
**Last Updated:** 2025-02-05
**Database:** Staging (hhprjbgknupaplivtoib)
**Status:** Ready for execution ✅
