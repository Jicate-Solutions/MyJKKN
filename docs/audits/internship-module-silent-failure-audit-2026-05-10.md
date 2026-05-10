# Internship Module — Silent-Failure Audit (Post-Ship)

**Date:** 2026-05-10
**Auditor:** Agent F (parallel sub-agent fan-out)
**Scope:** Internship Module substrate — PRs #785 #787 #788 #799 #824
**Verdict:** READY TO SHIP after audit-blocker fix PR merges.

---

## Scope

Tables, services, and admin UI shipped in:

| PR | Layer | Files |
|----|-------|------|
| #787 | SQL substrate | 19 tables, 3 RPC fns, RLS, policies |
| #785 | Service layer | `lib/services/internships/*.ts`, `lib/services/admin/internship-policy-service.ts` |
| #788 | Admin UI | `app/(routes)/admin/internship-policy/**`, hooks/internships/*.ts |
| #799 | Migration sync | aligned migration files with as-applied prod state |
| #824 | Shim | recovered `lib/services/internships/types.ts` + admin-service shim |

Production migrations applied to `kvizhngldtiuufknvehv` on 2026-05-09:
- `20260509_internship_module_substrate_v3.sql`
- `20260509_internship_module_reader_fn_v2.sql`
- `20260509_internship_module_seeds_v4.sql`
- `20260509_internship_module_lop_immunity_v2.sql`

---

## 1. RLS coverage

### 1a. Tables with RLS disabled

Verified via anon-key write probe + migration grep:
- All 19 `internship_*` tables have `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` in `20260509_internship_module_substrate_v3.sql` lines 386–404.
- Empty SELECT result for anon (`[]`, not error) confirms RLS is engaged.

**Verdict:** clean.

### 1b. Tables with RLS enabled but zero policies

Migration creates 19 policies (lines 406–445) — one per table. All probed via anon-key roundtrip.

**Verdict:** clean.

### 1c. RLS write-gap on `internship_site_types`  *(BLOCKER — fixed in this PR)*

Anon-key INSERT into `internship_site_types` succeeded with HTTP 201. The row was visible afterwards (`institution_id=null`, `created_by=null`). Reproduction:

```bash
curl -X POST .../rest/v1/internship_site_types \
  -H "apikey: <anon>" -H "Authorization: Bearer <anon>" \
  -H "Content-Type: application/json" \
  -d '{"config_key":"test","display_name":"test"}'
# HTTP/2 201
```

Cause: policy `USING (institution_id IS NULL OR institution_id IN (...))` was created with `FOR ALL`. Postgres uses USING as the implicit WITH CHECK when WITH CHECK is omitted. The `institution_id IS NULL` branch is true for anon writes, so writes with NULL institution land. Fix:

- Migration `20260510_internship_module_audit_blocker_fixes.sql` (in this PR) drops the loose policy and replaces it with a SELECT policy (reads global + caller-institution rows) and a separate FOR ALL policy with strict WITH CHECK that requires `institution_id IS NOT NULL` and a real `user_institution_access` row.

**Verdict:** blocker — fix in this PR.

---

## 2. Foreign-key index coverage

Static analysis of `20260509_internship_module_substrate_v3.sql`:

- **108 FKs across 19 tables.**
- **18 FKs have a leading-column index.** These are the ones used in CASCADE deletes and hot JOIN paths:
  - `internship_cycle_hospitals.cycle_id` (CASCADE) — indexed
  - `internship_assignments.cycle_id` (CASCADE) — indexed
  - `internship_logbook_entries.assignment_id` (CASCADE) — indexed
  - `internship_evaluations.assignment_id` (CASCADE) — indexed
  - `internship_assignments.{learner_id, site_id, facilitator_id}` — indexed
  - `internship_external_sites.{site_type_id, geo}` — indexed
  - `internship_certificates.{number, assignment_id}` — indexed
  - `internship_incidents.{severity-status, assignment_id}` — indexed
  - 4 partial indexes on _config child FKs

- **90 FKs lack a leading-column index** but most are audit columns (`created_by`, `updated_by`, `reviewed_by`, etc.) where unindexed FKs are an accepted trade-off (write-only). The notable performance-sensitive omissions are:
  - `institution_id` on 16 of 19 tables — currently only `internship_external_sites`, `internship_posting_cycles`, and `internship_cycle_status_labels` index it.

**Verdict:** advisory — RLS uses `WHERE institution_id IN (...)` on every query. Adding `institution_id` indexes on the 16 tables would speed every read on multi-tenant install. Backlog for follow-up PR.

---

## 3. Dangling code references

### 3a. Tables referenced by `lib/services/internships/*.ts` and `lib/services/admin/internship-policy-service.ts`

```
internship_assignments              ✓ exists
internship_certificates             ✓ exists
internship_college_notification_overrides ✓ exists
internship_evaluations              ✓ exists
internship_external_sites           ✓ exists
internship_incidents                ✓ exists
internship_logbook_entries          ✓ exists
internship_posting_cycles           ✓ exists
internship_preceptors               ✓ exists
internship_site_contacts            ✓ exists
internship_vehicles                 ✓ exists
```

All 11 referenced tables exist and respond HTTP 200 to anon SELECT.

**Verdict:** clean.

### 3b. RPC functions referenced

```
fn_internship_cascade_preview       ✓ exists, signature matches code
fn_internship_evaluate_policy       ✓ exists, signature DOES NOT MATCH code (BLOCKER — fixed in this PR)
```

`fn_internship_evaluate_policy` runtime probe:
```bash
curl -X POST .../rest/v1/rpc/fn_internship_evaluate_policy -d '{"p_key":"x","p_college_id":null}'
# {"code":"PGRST202","message":"...without parameters or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.",
#  "hint":"Perhaps you meant to call the function public.fn_internship_evaluate_policy(p_context, p_key)"}
```

The actual signature is `(p_key TEXT, p_context JSONB)`. The service called `(p_key, p_college_id)`. First call from `usePolicyValue()` would have surfaced PGRST202.

Fix in this PR: `lib/services/internships/policy-service.ts` rewrites `getPolicyValue()` and `getCascadePreview()` to match the deployed signature, builds `p_context` from `{college_id, institution_id}`, maps SQL `source` enum to typed `'global' | 'college_override'`, and translates `CascadePreviewChange.key -> policy_key` for the SQL function.

**Verdict:** blocker — fix in this PR.

---

## 4. Hardcoded role lists (Q3 violation)

```bash
grep -rE "role\s*===\s*['\"](super_admin|admin|...|director)['\"]" \
  lib/services/internships/ \
  lib/services/admin/internship-policy-service.ts \
  hooks/internships/ \
  "app/(routes)/admin/internship-policy/"
# (no matches)
```

**Verdict:** clean.

---

## 5. Hardcoded thresholds (Q3 violation)

```bash
grep -rE "(if|while|for).*[<>=]=?\s*[0-9]{2,}" \
  lib/services/internships/ \
  lib/services/admin/internship-policy-service.ts \
  hooks/internships/
# (no matches)
```

**Verdict:** clean. All thresholds resolved through `platform_policies` (e.g., `internship.policy.fee_compliance_threshold_pct`).

---

## 6. Types module — `lib/services/internships/types.ts`

Recovered in PR #824. Verified all 11 importing files resolve their type imports:

| Importer | Symbols imported | All exported |
|----------|------------------|--------------|
| `useCycles.ts` | CreateCycleInput, UpdateCycleInput | yes |
| `useEvaluations.ts` | CreateEvaluationInput, UpdateEvaluationInput, EvaluatorRole | yes |
| `usePreceptors.ts` | CreatePreceptorInput, UpdatePreceptorInput | yes |
| `useIncidents.ts` | CreateIncidentInput, UpdateIncidentInput | yes |
| `useLogbook.ts` | CreateLogbookEntryInput, UpdateLogbookEntryInput | yes |
| `useAssignments.ts` | CreateAssignmentInput, UpdateAssignmentInput, AssignmentFilters | yes |
| `useCertificates.ts` | CreateCertificateInput, UpdateCertificateInput | yes |
| `useSites.ts` | CreateSiteInput, UpdateSiteInput, CreateSiteContactInput, UpdateSiteContactInput | yes |
| `useVehicles.ts` | CreateVehicleInput, UpdateVehicleInput, VehicleStatus | yes |
| `usePolicy.ts` | CascadePreviewChange | yes |
| `internship-policy-service.ts` | InternshipPolicyRow, InternshipCollegeNotificationOverride, InternshipConfigTableInfo, ServiceResult, ServiceListResult | yes |

**Verdict:** clean.

---

## 7. Supabase advisors

MCP `mcp__supabase__get_advisors` was unreachable during the audit (auth token expired). Re-run after this PR merges and post any internship-* findings as a new audit entry.

**Verdict:** deferred — re-run when MCP recovers.

---

## Follow-up backlog (advisory — separate PR(s))

1. **Add `institution_id` indexes** on the 16 internship tables that lack them (RLS lookup speedup). Estimated 1 PR, partial-index pattern.
2. **Wire the additional `institutionId` parameter** through `usePolicyValue()` in `hooks/internships/usePolicy.ts` so college-scoped policy resolution can carry institution context end-to-end.
3. **Re-run `mcp__supabase__get_advisors`** for security + performance once MCP auth is refreshed; file any internship-touching findings.
4. **Type generation:** `lib/services/internships/types.ts` is hand-authored. Once `database.types.ts` covers internship_* tables, switch to generated types and delete duplicates.

---

## Sign-off

Module ready to ship **after the fix PR merges**. The two blockers are:
1. RLS write-gap on `internship_site_types` (fixed via migration in this PR).
2. RPC signature mismatch in `policy-service.ts::getPolicyValue` (fixed via TS edit in this PR).

No other blockers found.
