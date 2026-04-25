# MyJKKN HR Module — Sprint 1 Plan (Weeks 1-2)

**Parent spec:** `specs/myjkkn-hr-module-spec.md`
**Sprint goal:** Shadow-tenant foundation + Employee master master. Prove MyJKKN core unchanged.
**Duration:** 2 weeks
**Exit criteria:** Central HR officer can log in to `/hr/employees`, see all JKKN staff, create/edit/deactivate. MyJKKN core queries (verified via EXPLAIN ANALYZE) show zero performance delta.

---

## Phase A — Shadow Tenant Foundation (Day 1-3)

**Goal:** `hr_organizations` + trigger + access table + RLS helper. Zero impact on MyJKKN core.

| # | Task | Files | Verification |
|---|------|-------|--------------|
| A1 | Run baseline EXPLAIN ANALYZE on 5 MyJKKN core tables; save output | `specs/sprint-01-baselines.txt` (new) | File contains 5 query plans with row + timing |
| A2 | Append `hr_organizations` table creation SQL | `supabase/setup/01_tables.sql` | Table exists with `source`, `institution_id`, `slug` columns + check constraint |
| A3 | Append `user_hr_access` table creation SQL | `supabase/setup/01_tables.sql` | Table exists with `role` field, composite PK |
| A4 | Append `auth_hr_organization_id()` function | `supabase/setup/02_functions.sql` | Function callable, returns UUID or NULL |
| A5 | Append `sync_institution_to_hr_org()` trigger function | `supabase/setup/04_triggers.sql` | Function defined, `ON CONFLICT DO NOTHING` present |
| A6 | Attach trigger to `institutions` table (AFTER INSERT) | `supabase/setup/04_triggers.sql` | Trigger listed in `pg_trigger` |
| A7 | Backfill existing JKKN institutions into `hr_organizations` | Migration: `supabase/migrations/20260414_hr_sprint01_backfill.sql` (new) | `SELECT COUNT(*) FROM hr_organizations WHERE source='jkkn'` matches `COUNT(*) FROM institutions` |
| A8 | Create `sync_jkkn_user_hr_access()` function + backfill existing profiles | `supabase/setup/02_functions.sql` + migration | `user_hr_access` has one row per existing profile with role mapping |
| A9 | Re-run EXPLAIN ANALYZE from A1; diff against baseline | Append to `specs/sprint-01-baselines.txt` | Plans identical; timing within ±10% |

**Verification gate at end of Phase A:** Run A9 diff. If ANY core query plan changed, roll back and investigate. This is the shadow-tenant guarantee.

---

## Phase B — Employee Master Tables (Day 3-5)

**Goal:** `hr_cadres`, `hr_designations`, `hr_employees`. Seeded with JKKN manual §13 + §6 data.

| # | Task | Files | Verification |
|---|------|-------|--------------|
| B1 | Append `hr_cadres` table creation | `supabase/setup/01_tables.sql` | Table exists with `name`, `code`, `description` |
| B2 | Seed `hr_cadres` with 3 rows: Teaching, Supporting-Technical, Non-Technical | Migration: `supabase/migrations/20260414_hr_cadres_seed.sql` | 3 rows exist |
| B3 | Append `hr_designations` table (FK to `hr_cadres` + `hr_organization_id`) | `supabase/setup/01_tables.sql` | Table exists with indexes |
| B4 | Seed `hr_designations` from JKKN manual §13 per JKKN institution: Principal, VP, HOD, Prof, Assoc Prof, Asst Prof, Lab Instructor, Lab Technician, Lab Assistant, Drivers, Librarian, Physical Director, Typist | Migration: `supabase/migrations/20260414_hr_designations_seed.sql` | ≥13 rows per JKKN institution |
| B5 | Append `hr_employees` table (staff_id nullable FK, all HR fields per spec §10) | `supabase/setup/01_tables.sql` | Table exists with `employee_code`, `date_of_joining`, `employment_type`, `reports_to_employee_id` |
| B6 | Add indexes on `hr_employees`: `hr_organization_id`, `staff_id`, `(hr_organization_id, employee_code) UNIQUE` | `supabase/setup/01_tables.sql` | 3 indexes visible in `pg_indexes` |
| B7 | Add RLS policies on Phase B tables using `auth_hr_organization_id() OR is_super_admin()` | `supabase/setup/03_policies.sql` | 3 policies exist, `pg_policies` shows each |
| B8 | Sync script: populate `hr_employees` from existing `staff` table for JKKN | Migration: `supabase/migrations/20260414_hr_employees_backfill.sql` | Row count matches `staff` count for JKKN institutions |
| B9 | Re-run EXPLAIN ANALYZE against baseline (must still be unchanged) | Append to baselines file | Plans identical |

---

## Phase C — Module Scaffold (Day 5-6)

**Goal:** Empty but routable `/hr/` section inside MyJKKN. Sidebar entry. Folder structure.

| # | Task | Files | Verification |
|---|------|-------|--------------|
| C1 | Create `app/(routes)/hr/layout.tsx` (reuse MyJKKN layout wrapper) | NEW | `/hr` route returns 200 with MyJKKN shell |
| C2 | Create `app/(routes)/hr/page.tsx` — stub dashboard with "HR Module — Sprint 1" heading + 4 metric cards (all placeholders) | NEW | Visible at `/hr` |
| C3 | Add HR entry to sidebar (behind super_admin check for now) | `lib/sidebarMenuLink.ts` | HR link visible for super_admin users |
| C4 | Create folder structure: `features/hr/employees/{types.ts, data.ts, actions.ts, components/}` + `lib/services/hr/` + `hooks/hr/` | NEW | Folders exist |
| C5 | Add TypeScript types for HREmployee to `types/hr.ts` (new file) | NEW | `HREmployee`, `HRDesignation`, `HRCadre` interfaces defined |
| C6 | Regenerate Supabase types (`~/bin/supabase gen types typescript`) to include new tables | `types/supabase.ts` | `hr_employees`, `hr_organizations` appear in generated types |

---

## Phase D — Employee CRUD (Day 6-9)

**Goal:** Central HR officer can list, view, create, edit, deactivate employees via UI.

| # | Task | Files | Verification |
|---|------|-------|--------------|
| D1 | Zod schema for employee create/update | `features/hr/employees/types.ts` | `CreateEmployeeSchema.parse()` works |
| D2 | `lib/services/hr/employee-service.ts` — list/get/create/update/deactivate methods | NEW | Unit-testable, uses Supabase client |
| D3 | API route: `GET /api/hr/employees` with `withAuth` + super_admin optional institution filter | `app/api/hr/employees/route.ts` | Returns paginated list for authenticated user's `hr_organization_id` |
| D4 | API route: `GET/PATCH/DELETE /api/hr/employees/[id]` | `app/api/hr/employees/[id]/route.ts` | CRUD works via API |
| D5 | React Query hooks: `useEmployees`, `useEmployee`, `useCreateEmployee`, `useUpdateEmployee`, `useDeactivateEmployee` | `hooks/hr/use-employees.ts` | Follow MyJKKN hook pattern with `isSuperAdmin` bypass |
| D6 | Employee list page with data table (reuse MyJKKN `components/ui/data-table`) | `app/(routes)/hr/employees/page.tsx` | Paginated list, filters by institution + cadre + active |
| D7 | Employee columns definition (name, code, designation, institution, status, actions) | `features/hr/employees/components/employee-columns.tsx` | Column header sort works |
| D8 | Employee form component (create + edit modes, React Hook Form + Zod) | `features/hr/employees/components/employee-form.tsx` | Validation errors shown inline |
| D9 | New employee page at `/hr/employees/new` | `app/(routes)/hr/employees/new/page.tsx` | Form renders, submit creates row |
| D10 | Employee detail/edit page at `/hr/employees/[id]` | `app/(routes)/hr/employees/[id]/page.tsx` | Form pre-filled; save updates row |
| D11 | Deactivate employee confirmation flow | Form component + service | Soft-delete: `is_active=false` + `deactivated_at` timestamp |

---

## Phase E — Verification & Demo (Day 10)

**Goal:** Prove the sprint exit criteria hold. Demo to user.

| # | Task | Verification |
|---|------|--------------|
| E1 | Run `npm run build` — must pass with zero new TS errors | Build output clean |
| E2 | Final EXPLAIN ANALYZE comparison — MyJKKN core plans identical to baseline | Diff file shows no changes |
| E3 | Manual smoke test: log in as super_admin, visit `/hr/employees`, see all JKKN staff | Screenshot captured |
| E4 | Manual smoke test: create test employee, edit designation, deactivate | Screenshot each step |
| E5 | Browser test via `skill: browser-test` — click every action on `/hr/employees` | Browser-test report clean |
| E6 | Update `progress.txt` + `features.json` with Sprint 1 completion | Files reflect 1/26 features shipped |
| E7 | Demo session with Omm: walk through `/hr/employees` flow | User signs off |
| E8 | Commit + PR to `Jicate-Solutions/MyJKKN` | PR #N opened, awaits merge |

---

## Guardrails (Apply Throughout Sprint)

1. **Never modify MyJKKN core tables.** All new tables in `supabase/setup/01_tables.sql` are APPENDED. No `ALTER TABLE` on `staff`, `institutions`, etc.
2. **Always include super_admin bypass in RLS.** Every new policy: `auth_hr_organization_id() = hr_organization_id OR is_super_admin()`.
3. **Hook pattern must include `isSuperAdmin` bypass.** Per MyJKKN memory `feedback_parallel_agent_security.md`.
4. **Use `withAuth` for every API route.** No inline auth.
5. **No cricket in sports lists.** (Per MyJKKN memory — not relevant to HR but reinforcing rules discipline.)
6. **Big-bang cutover spec §14 is NOT this sprint.** Migration tool is Phase M1, weeks 13-14.

## Risks in Sprint 1

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `staff` table missing fields we assume exist | Medium | A9 EXPLAIN verification catches schema surprises; types re-gen in C6 |
| RLS policy breaks super_admin access | Medium | Include `is_super_admin()` in every policy; test with super_admin role |
| Trigger fires recursively | Low | `ON CONFLICT DO NOTHING` prevents loops |
| Backfill migration is slow for large staff table | Low | <1000 rows; sub-second operation |

## Blocking Questions (From Parent Spec §17)

**None block this sprint.** Resolutions locked (2026-04-14 evening):

| Question | Resolution |
|----------|-----------|
| eSSL device models | Build defensively for generic eSSL HTTP protocol — common denominator across X990/K21/eTimeTrackLite. Model-specific tweaks during Sprint 4 UAT. |
| hrapp.co CSV export sample | Build generic CSV importer with field-mapping UI in Sprint 13. Request sample from JKKN IT / Sri @ hrapp.co ASAP in parallel. |
| Class-proxy SLA | Faculty attendance marking must be **before 4:30 PM** (HR manual §14 working-hours boundary) to count as class-proxy. Encoded in `hr_attendance_proxy_rules`. |
| Leave policy per-institution | Confirmed per-institution (Round 4 Q2). `hr_leave_policies` scoped to institution. |

All resolved. Sprint 1 proceeds immediately.

## Deliverables at Sprint End

- [ ] PR to `Jicate-Solutions/MyJKKN` with all Phase A-D changes
- [ ] 3 migration files in `supabase/migrations/`
- [ ] Updated `supabase/setup/0{1,2,3,4}.sql` files
- [ ] New `/hr/employees` route working in production
- [ ] EXPLAIN ANALYZE diff file proving zero MyJKKN impact
- [ ] Screenshots of Central HR officer flow
- [ ] `progress.txt` reflects Sprint 1 shipped

---

*This sprint plan is derived mechanically from spec §18 Week 1-2 + §6 policy tables B-rank. Subsequent sprints (2-13) will be planned independently via /writing-plans as Sprint 1 ships.*
