# Quick Execution Guide - TQM Test Data

**Target:** Staging Database (hhprjbgknupaplivtoib)
**URL:** https://hhprjbgknupaplivtoib.supabase.co

---

## ⚡ Quick Start (Recommended Method)

### Step 1: Open Supabase SQL Editor

Open this URL in your browser:
```
https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql/new
```

### Step 2: Copy the SQL Script

The SQL file is located at:
```
/Users/omm/PROJECTS/MyJKKN/docs/MyJKKN-TQM-Specs/test-data-comprehensive.sql
```

Open the file, copy ALL contents (it's a long file ~600 lines)

### Step 3: Paste and Execute

1. Paste the entire SQL script into the SQL Editor
2. Click the **Run** button (or press Cmd+Enter on Mac)
3. Wait for execution (should take 10-30 seconds)

### Step 4: Check Output

You should see NOTICE messages in the Results panel:
```
NOTICE:  Using Institution ID: <uuid>
NOTICE:  Using Admin User ID: <uuid>
NOTICE:  Creating NPS test data...
NOTICE:  NPS data created: 2 surveys, 23 responses
...
NOTICE:  TEST DATA CREATION COMPLETE
```

---

## 📊 What Gets Created

| Module | Data Created |
|--------|-------------|
| **F001 NPS** | 2 surveys, 23 responses (8 promoters, 6 passives, 9 detractors) |
| **F002 Process** | 3 process definitions, 5 instances, 11 waste incidents (all TIMWOOD), 2 audits |
| **F003 Parent Portal** | 3 parent profiles, 4 parent-learner links, 6 communications |
| **F004 Grievance** | 5 categories, 10 tickets (various statuses), 5 comments, 5 history entries |
| **F005 Maturity** | 1 framework, 3 assessments (stages 1-3), 7 progress items |
| **F006 OKR ABCD** | 2 objectives, 12 key results (3 A's, 3 B's, 3 C's, 3 D's) |
| **F007 COPQ** | 16 billing COPQ incidents across all 10 categories |

**Total Records Created:** ~150+ records across all modules

---

## ✅ Quick Verification

After execution, run these quick checks in SQL Editor:

### Check NPS Data
```sql
SELECT
  s.title,
  s.stakeholder_type,
  COUNT(r.id) as response_count,
  SUM(CASE WHEN r.nps_category = 'promoter' THEN 1 ELSE 0 END) as promoters,
  SUM(CASE WHEN r.nps_category = 'passive' THEN 1 ELSE 0 END) as passives,
  SUM(CASE WHEN r.nps_category = 'detractor' THEN 1 ELSE 0 END) as detractors
FROM nps_surveys s
LEFT JOIN nps_responses r ON r.survey_id = s.id
WHERE s.status = 'active'
GROUP BY s.id, s.title, s.stakeholder_type;
```

**Expected:**
- Student survey: 15 responses (5 promoters, 4 passives, 6 detractors)
- Parent survey: 8 responses (3 promoters, 2 passives, 3 detractors)

### Check Grievance Tickets
```sql
SELECT
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN sla_status = 'breached' THEN 1 END) as breached
FROM grievance_tickets
GROUP BY status
ORDER BY status;
```

**Expected:** 10 tickets across 6 statuses (open, in_progress, pending_info, resolved, closed, reopened)

### Check OKR ABCD Distribution
```sql
SELECT
  abcd_category,
  COUNT(*) as count,
  ARRAY_AGG(title ORDER BY progress DESC) as examples
FROM okr_key_results
WHERE abcd_category IS NOT NULL
GROUP BY abcd_category
ORDER BY abcd_category;
```

**Expected:** 3 key results in each category (A, B, C, D)

### Check COPQ Total Costs
```sql
SELECT
  COUNT(*) as total_incidents,
  SUM(visible_cost) as total_visible,
  SUM(hidden_cost_estimate) as total_hidden,
  SUM(visible_cost + hidden_cost_estimate) as total_copq,
  SUM(time_spent_hours) as total_hours_lost
FROM billing_copq_incidents;
```

**Expected:**
- 16 incidents
- Visible: ~₹137,000
- Hidden: ~₹103,300
- Total COPQ: ~₹240,300
- Time lost: ~136 hours

---

## 🔍 Browse Data in Supabase Dashboard

After execution, browse the data using Table Editor:

1. **NPS Module:**
   - Tables: `nps_surveys`, `nps_responses`, `nps_analytics`
   - URL: https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/editor

2. **Process Excellence:**
   - Tables: `process_definitions`, `process_instances`, `waste_incidents`, `process_audits`

3. **Parent Portal:**
   - Tables: `parent_profiles`, `parent_learner_links`, `parent_communications`

4. **Grievance:**
   - Tables: `grievance_categories`, `grievance_tickets`, `grievance_comments`, `grievance_history`

5. **Maturity Assessment:**
   - Tables: `maturity_frameworks`, `maturity_assessments`, `maturity_progress`

6. **OKR ABCD:**
   - Tables: `okr_objectives`, `okr_key_results` (check `process_rating` and `abcd_category` columns)

7. **Billing COPQ:**
   - Table: `billing_copq_incidents`

---

## 🧪 Test in Staging App

After data is loaded, test the frontend:

**App URL:** https://myjkkn-omm-dev.vercel.app

**Test Account:**
- Email: `test-superadmin@jkkn.local`
- Password: `SuperAdmin@123`

**Modules to Test:**
1. Navigate to each TQM module
2. Verify data appears correctly
3. Test filters, sorting, search
4. Try CRUD operations

---

## ⚠️ Troubleshooting

### "Permission denied" or "RLS policy violation"
**Solution:** Make sure you're logged into Supabase dashboard with the correct account (aiengineering@jkkn.ac.in)

### "Column does not exist"
**Solution:** The schema might need to be created first. Run the schema setup files before test data:
1. `/Users/omm/PROJECTS/MyJKKN/supabase/setup/01_tables.sql`
2. `/Users/omm/PROJECTS/MyJKKN/supabase/setup/02_functions.sql`
3. Then run test data

### "No institution found"
**Solution:** Script will automatically use the first institution. If none exists, create one first or modify the script to use a specific institution_id.

### Script times out
**Solution:** The script is wrapped in a DO block which might timeout. If this happens, break it into smaller chunks:
- Part 1: F001-F003 (NPS, Process, Parent)
- Part 2: F004-F005 (Grievance, Maturity)
- Part 3: F006-F007 (OKR, COPQ)

---

## 📝 Notes

- **Idempotency:** Script can be run multiple times. It will create duplicate data (new UUIDs each time). If you want to reset, delete the data first.
- **Data Relationships:** All data is properly linked via foreign keys. Deleting parent records will cascade delete child records.
- **Realistic Data:** Data is production-like with realistic scenarios, edge cases, and variety.
- **Safe for Testing:** This is staging database. Safe to experiment, modify, delete without affecting production.

---

## 🎯 Success Indicators

After successful execution, you should be able to:

✅ View 2 active NPS surveys with 23 total responses
✅ See process excellence dashboard with 3 processes and waste tracking
✅ Login as parent and see linked learners with communications
✅ Browse 10 grievance tickets with various statuses and SLA tracking
✅ View maturity assessment progression from Crisis → Stability stages
✅ Analyze OKR ABCD matrix with examples in all 4 quadrants
✅ Review billing COPQ dashboard showing hidden vs visible costs

---

**Ready to Execute?** Copy `test-data-comprehensive.sql` and paste into Supabase SQL Editor!

**Dashboard URL:** https://supabase.com/dashboard/project/hhprjbgknupaplivtoib/sql/new
