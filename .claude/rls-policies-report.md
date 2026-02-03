# Solutions Hub RLS Policies Report

**Generated:** 2026-02-03
**Target:** MyJKKN STAGING (hhprjbgknupaplivtoib)
**Status:** PREPARED (Ready for Review)

---

## Executive Summary

Complete RLS policies have been designed and prepared for the Solutions Hub integration into MyJKKN. This report covers:

- **15 helper functions** for role detection and access control
- **30 tables** with RLS enabled
- **120+ policies** covering SELECT, INSERT, UPDATE, DELETE operations
- **8 role types** with distinct access patterns

---

## 1. Helper Functions (sh_ prefix)

### 1.1 Role Detection Functions

| Function | Returns | Purpose | Used By |
|----------|---------|---------|---------|
| `sh_is_admin()` | BOOLEAN | Check if super_admin, admin, or jicate_staff | All admin policies |
| `sh_is_jicate_staff()` | BOOLEAN | Check if JICATE staff specifically | JICATE session policies |
| `sh_is_hod()` | BOOLEAN | Check if HOD role | Department-level policies |
| `sh_is_staff()` | BOOLEAN | Check if department staff (includes HOD) | General staff policies |
| `sh_is_builder()` | BOOLEAN | Check if active builder | Builder portal policies |
| `sh_is_cohort_member()` | BOOLEAN | Check if active cohort member | Cohort portal policies |
| `sh_is_production_learner()` | BOOLEAN | Check if active production learner | Production portal policies |
| `sh_is_client()` | BOOLEAN | Check if client role | Client portal policies |

### 1.2 ID Retrieval Functions

| Function | Returns | Purpose |
|----------|---------|---------|
| `sh_user_department_id()` | UUID | Get user's department from profiles |
| `sh_user_institution_id()` | UUID | Get user's institution from profiles |
| `sh_get_builder_id()` | UUID | Get builder record ID for current user |
| `sh_get_cohort_member_id()` | UUID | Get cohort member record ID for current user |
| `sh_get_production_learner_id()` | UUID | Get production learner record ID for current user |
| `sh_get_client_id()` | UUID | Get client ID by matching user email to contact_email |

### 1.3 Access Control Functions

| Function | Returns | Purpose |
|----------|---------|---------|
| `sh_can_access_solution(UUID)` | BOOLEAN | Check if user can access a specific solution |

---

## 2. Role Access Matrix

### 2.1 Role Hierarchy

```
super_admin
    └── Full access to all tables and operations

admin
    └── Full access to all tables and operations

jicate_staff
    └── Full access to Solutions Hub (treated as admin within module)
    └── Primary responsibility: JICATE sessions, facilitation

hod (Head of Department)
    └── Department-scoped access
    └── Can approve builder/cohort/production assignments
    └── Can view financial data (payments, earnings)

staff (Department Staff)
    └── Department-scoped access (more restricted than HOD)
    └── Can create solutions, phases, assignments
    └── Cannot view sensitive financial data

builder
    └── Own profile management
    └── View/claim phase assignments
    └── Submit work, report bugs
    └── View own earnings

cohort_member
    └── Own profile management
    └── View assigned training sessions
    └── View own earnings

production_learner
    └── Own profile management
    └── View assigned deliverables
    └── Submit content work
    └── View own earnings

client
    └── View own solutions and phases
    └── View own payments and invoices
    └── View deliverables
    └── Report bugs on iterations
```

### 2.2 Access by Table

| Table | Admin | HOD | Staff | Builder | Cohort | Production | Client |
|-------|-------|-----|-------|---------|--------|------------|--------|
| sh_clients | FULL | Dept | Dept | Assigned | - | - | Own |
| sh_solutions | FULL | Dept | Dept | Assigned | Assigned | Assigned | Own |
| sh_solution_phases | FULL | Dept | Dept | Assigned | - | - | Own |
| sh_solution_mous | FULL | Dept | - | - | - | - | - |
| sh_builders | FULL | Dept | Dept | Own | - | - | - |
| sh_builder_skills | FULL | Dept | Dept | Own | - | - | - |
| sh_builder_assignments | FULL | Dept | Dept | Own | - | - | - |
| sh_prototype_iterations | FULL | Dept | Dept | Assigned | - | - | Own |
| sh_bug_reports | FULL | Dept | Dept | Assigned | - | - | Own |
| sh_phase_deployments | FULL | Dept | Dept | - | - | - | - |
| sh_implementation_users | FULL | Dept | Dept | - | - | - | Own |
| sh_training_programs | FULL | READ | READ | - | Assigned | - | Own |
| sh_training_sessions | FULL | READ | READ | - | Assigned | - | - |
| sh_cohort_members | FULL | Dept | Dept | - | Own | - | - |
| sh_cohort_assignments | FULL | READ | READ | - | Own | - | - |
| sh_content_orders | FULL | READ | READ | - | - | Assigned | Own |
| sh_content_deliverables | FULL | READ | READ | - | - | Assigned | Own |
| sh_production_learners | FULL | READ | READ | - | - | Own | - |
| sh_production_assignments | FULL | READ | READ | - | - | Own | - |
| sh_discovery_visits | FULL | Dept | Dept | - | - | - | Own |
| sh_client_communications | FULL | READ | READ | - | - | - | Own |
| sh_revenue_split_models | FULL | READ | - | - | - | - | - |
| sh_payments | FULL | READ | - | - | - | - | Own |
| sh_earnings_ledger | FULL | READ | Dept | Own | Own | Own | - |
| sh_client_referrals | FULL | Dept | Dept | - | - | - | - |
| sh_publications | FULL | FULL | FULL | Create | - | - | - |
| sh_publication_contributors | FULL | FULL | FULL | - | - | - | - |
| sh_accreditation_metrics | FULL | READ | READ | READ | READ | READ | READ |
| sh_jicate_sessions | FULL | Dept | Dept | - | - | - | - |
| sh_notifications | FULL | Own | Own | Own | Own | Own | Own |
| sh_audit_logs | READ | - | - | - | - | - | - |

Legend:
- **FULL**: All CRUD operations
- **READ**: SELECT only
- **Dept**: Department-scoped (own department's data)
- **Own**: Own records only
- **Assigned**: Records they are assigned to
- **Create**: Can create but limited edit
- **-**: No access

---

## 3. Security Patterns Implemented

### 3.1 Client Isolation (CRITICAL)

Clients can ONLY see their own data. This is enforced by:

```sql
-- Pattern used across all client-accessible tables
OR (sh_is_client() AND client_id = sh_get_client_id())
-- OR
OR (sh_is_client() AND solution_id IN (
    SELECT id FROM public.sh_solutions WHERE client_id = sh_get_client_id()
))
```

**Tables with client isolation:**
- sh_clients (own profile)
- sh_solutions (own solutions)
- sh_solution_phases (phases of own solutions)
- sh_prototype_iterations (iterations of own solutions)
- sh_bug_reports (bugs on own iterations)
- sh_implementation_users (users on own phases)
- sh_training_programs (programs for own solutions)
- sh_content_orders (orders for own solutions)
- sh_content_deliverables (deliverables for own orders)
- sh_discovery_visits (visits to own company)
- sh_client_communications (communications about own account)
- sh_payments (own payments)

### 3.2 Builder Isolation

Builders see only their assignments and related data:

```sql
-- Builders see solutions they're assigned to
OR (sh_is_builder() AND id IN (
    SELECT sp.solution_id FROM public.sh_solution_phases sp
    JOIN public.sh_builder_assignments ba ON ba.phase_id = sp.id
    WHERE ba.builder_id = sh_get_builder_id()
))
```

### 3.3 Cohort Member Isolation

Cohort members see only their sessions:

```sql
-- Cohort members see programs they're involved in
OR (sh_is_cohort_member() AND id IN (
    SELECT tp.id FROM public.sh_training_programs tp
    JOIN public.sh_training_sessions ts ON ts.program_id = tp.id
    JOIN public.sh_cohort_assignments ca ON ca.session_id = ts.id
    WHERE ca.cohort_member_id = sh_get_cohort_member_id()
))
```

### 3.4 Production Learner Isolation

Production learners see only their deliverables:

```sql
-- Production learners see orders they're assigned to
OR (sh_is_production_learner() AND id IN (
    SELECT co.id FROM public.sh_content_orders co
    JOIN public.sh_content_deliverables cd ON cd.order_id = co.id
    JOIN public.sh_production_assignments pa ON pa.deliverable_id = cd.id
    WHERE pa.learner_id = sh_get_production_learner_id()
))
```

### 3.5 Department Scoping

HOD and Staff see only their department's data:

```sql
-- HOD/Staff sees department solutions
OR (sh_is_hod() AND lead_department_id = sh_user_department_id())
OR (sh_is_staff() AND lead_department_id = sh_user_department_id())
```

### 3.6 Financial Data Protection

Sensitive financial tables have restricted access:

| Table | Who Can See | Who Can Write |
|-------|-------------|---------------|
| sh_solution_mous | Admin, HOD (dept) | Admin, HOD |
| sh_revenue_split_models | Admin, HOD | Admin only |
| sh_payments | Admin, HOD, Client (own) | Admin, HOD |
| sh_earnings_ledger | Admin, HOD, Recipients | Admin only |

### 3.7 Audit Log Immutability

Audit logs are immutable - no UPDATE or DELETE policies exist:

```sql
-- Only INSERT allowed (via triggers)
-- SELECT restricted to admins only
CREATE POLICY "sh_audit_logs_select" ON public.sh_audit_logs
    FOR SELECT TO authenticated
    USING (sh_is_admin());
```

---

## 4. Tables and Policy Count

| Table | SELECT | INSERT | UPDATE | DELETE | Total |
|-------|--------|--------|--------|--------|-------|
| sh_clients | 1 | 1 | 1 | 1 | 4 |
| sh_solutions | 1 | 1 | 1 | 1 | 4 |
| sh_solution_phases | 1 | 1 | 1 | 1 | 4 |
| sh_solution_mous | 1 | 1 | 1 | 1 | 4 |
| sh_builders | 1 | 1 | 1 | 1 | 4 |
| sh_builder_skills | 1 | 1 | 1 | 1 | 4 |
| sh_builder_assignments | 1 | 1 | 1 | 1 | 4 |
| sh_prototype_iterations | 1 | 1 | 1 | 1 | 4 |
| sh_bug_reports | 1 | 1 | 1 | 1 | 4 |
| sh_phase_deployments | 1 | 1 | 1 | 1 | 4 |
| sh_implementation_users | 1 | 1 | 1 | 1 | 4 |
| sh_training_programs | 1 | 1 | 1 | 1 | 4 |
| sh_training_sessions | 1 | 1 | 1 | 1 | 4 |
| sh_cohort_members | 1 | 1 | 1 | 1 | 4 |
| sh_cohort_assignments | 1 | 1 | 1 | 1 | 4 |
| sh_content_orders | 1 | 1 | 1 | 1 | 4 |
| sh_content_deliverables | 1 | 1 | 1 | 1 | 4 |
| sh_production_learners | 1 | 1 | 1 | 1 | 4 |
| sh_production_assignments | 1 | 1 | 1 | 1 | 4 |
| sh_discovery_visits | 1 | 1 | 1 | 1 | 4 |
| sh_client_communications | 1 | 1 | 1 | 1 | 4 |
| sh_revenue_split_models | 1 | 1 | 1 | 1 | 4 |
| sh_payments | 1 | 1 | 1 | 1 | 4 |
| sh_earnings_ledger | 1 | 1 | 1 | 1 | 4 |
| sh_client_referrals | 1 | 1 | 1 | 1 | 4 |
| sh_publications | 1 | 1 | 1 | 1 | 4 |
| sh_publication_contributors | 1 | 1 | 1 | 1 | 4 |
| sh_accreditation_metrics | 1 | 1 | 1 | 1 | 4 |
| sh_jicate_sessions | 1 | 1 | 1 | 1 | 4 |
| sh_notifications | 1 | 1 | 1 | 1 | 4 |
| sh_audit_logs | 1 | 1 | 0 | 0 | 2 |
| **TOTAL** | **31** | **31** | **30** | **30** | **122** |

---

## 5. File Locations

### 5.1 Updated Files

| File | What Changed |
|------|--------------|
| `supabase/setup/03_policies.sql` | Added Section 16: Solutions Hub RLS (1200+ lines) |

### 5.2 Helper Functions Location

All helper functions are in `03_policies.sql` at the start of Section 16:
- Lines: ~2670-2850 (approximately)
- Functions: 15 total with `sh_` prefix

### 5.3 Policy Locations

Each table's policies follow this pattern:
```sql
-- ================================================================================
-- SH_[TABLE_NAME] TABLE POLICIES
-- [Description]
-- Access: [Access pattern summary]
-- ================================================================================

ALTER TABLE public.sh_[table] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sh_[table]_select" ...
CREATE POLICY "sh_[table]_insert" ...
CREATE POLICY "sh_[table]_update" ...
CREATE POLICY "sh_[table]_delete" ...
```

---

## 6. Testing Checklist

Before deploying to staging, test these scenarios:

### 6.1 Admin Access
- [ ] Admin can see all data in all tables
- [ ] Admin can create/update/delete in all tables

### 6.2 Client Isolation (CRITICAL)
- [ ] Client A cannot see Client B's solutions
- [ ] Client A cannot see Client B's payments
- [ ] Client A cannot see other clients' communications
- [ ] Client can see their own deliverables

### 6.3 Builder Access
- [ ] Builder sees only assigned phases
- [ ] Builder can update own profile
- [ ] Builder can report bugs on assigned iterations
- [ ] Builder sees own earnings only

### 6.4 Cohort Member Access
- [ ] Cohort member sees only assigned sessions
- [ ] Cohort member can update own profile
- [ ] Cohort member sees own earnings only

### 6.5 Production Learner Access
- [ ] Production learner sees only assigned deliverables
- [ ] Production learner can update own profile
- [ ] Production learner sees own earnings only

### 6.6 HOD Access
- [ ] HOD sees only department data
- [ ] HOD can approve assignments
- [ ] HOD can view financial data (payments, earnings)
- [ ] HOD cannot see other department's MOUs

### 6.7 Staff Access
- [ ] Staff sees only department data
- [ ] Staff can create solutions, phases
- [ ] Staff cannot see sensitive financial data

---

## 7. Migration Notes

### 7.1 Prerequisites

Before applying these policies, ensure:

1. **Tables exist**: All `sh_` tables must be created first (from SPEC migration)
2. **Roles exist**: Custom roles must be added to `custom_roles` table:
   - `builder`
   - `cohort_member`
   - `production_learner`
   - `jicate_staff`
   - `client`

### 7.2 Execution Order

```sql
-- 1. First run schema migration (creates sh_ tables)
-- 2. Then run policies (this section of 03_policies.sql)
-- 3. Test with demo accounts
```

### 7.3 Rollback

To rollback all Solutions Hub policies:

```sql
-- Drop all sh_ policies
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE policyname LIKE 'sh_%')
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON ' || quote_ident(r.tablename);
    END LOOP;
END $$;

-- Drop helper functions
DROP FUNCTION IF EXISTS sh_is_admin();
DROP FUNCTION IF EXISTS sh_is_jicate_staff();
DROP FUNCTION IF EXISTS sh_is_hod();
DROP FUNCTION IF EXISTS sh_is_staff();
DROP FUNCTION IF EXISTS sh_user_department_id();
DROP FUNCTION IF EXISTS sh_user_institution_id();
DROP FUNCTION IF EXISTS sh_is_builder();
DROP FUNCTION IF EXISTS sh_get_builder_id();
DROP FUNCTION IF EXISTS sh_is_cohort_member();
DROP FUNCTION IF EXISTS sh_get_cohort_member_id();
DROP FUNCTION IF EXISTS sh_is_production_learner();
DROP FUNCTION IF EXISTS sh_get_production_learner_id();
DROP FUNCTION IF EXISTS sh_is_client();
DROP FUNCTION IF EXISTS sh_get_client_id();
DROP FUNCTION IF EXISTS sh_can_access_solution(UUID);
```

---

## 8. Next Steps

1. **Review**: Have team review this report and policies
2. **Schema First**: Apply schema migration to create sh_ tables
3. **Add Roles**: Insert new roles into custom_roles table
4. **Apply Policies**: Run the policies section of 03_policies.sql
5. **Test**: Run through testing checklist with demo accounts
6. **Document**: Update SQL_FILE_INDEX.md with new policies

---

*Report generated by Claude Agent*
*Last Updated: 2026-02-03*
