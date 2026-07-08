# `is_admin()` RLS bypass — systemic cross-tenant leak: scoping + staged remediation

**Status:** SCOPING ONLY (no code change in this doc). Deferred follow-up flagged in PR #1836 / the Cohort Moat P0 set.
**Date:** 2026-07-06
**Owner:** TBD (Director to assign)

> ⚠️ Do **not** batch-strip `is_admin()`. A blind removal locks out real super-admins and breaks every legitimate bypass. This is a *tranched* migration, module by module, each tranche impersonation-tested before the next.

---

## 1. What the bug is

`is_admin()` = `is_super_admin() OR profiles.role IN ('admin','super_admin','administrator')`.

It reads the **legacy single `profiles.role`** column and is used as an unconditional bypass at the *front* of RLS policies:

```sql
CREATE POLICY "..._select" ON some_table FOR SELECT USING (
  is_super_admin() OR is_admin()                       -- ← bypass, ignores institution
  OR (user_has_permission('x.view') AND role_has_institution_access(institution_id))
);
```

On any table that carries `institution_id`, the `is_admin()` disjunct means **any user whose legacy role is `admin`/`administrator`/`super_admin` reads (and often writes) EVERY institution's rows** — the `role_has_institution_access(institution_id)` tenant scoping in the third clause is never reached for them. That is a cross-tenant data leak for a multi-tenant platform.

This is the same class as the documented `feedback_systemic_is_admin_rls_cross_tenant_leak` memory and the `is_cdc_staff()` legacy-role finding.

## 2. Precise blast radius (measured on prod `kvizhngldtiuufknvehv`, 2026-07-06)

| Metric | Count |
|---|---|
| Policies referencing `is_admin()` | **1,106** |
| Distinct tables using `is_admin()` | **443** |
| **…of those, tables that ALSO have `institution_id`** (the leak-prone subset) | **228** |
| Tables using `is_admin()` with **no** `institution_id` (system-wide — not a tenant leak) | 215 |
| Policies referencing `is_super_admin()` | 1,314 |
| Total public policies | 3,287 |

**The remediation target is the 228 `institution_id` tables, not all 443.** On the 215 system-wide tables, `is_admin()` leaks nothing tenant-scoped (there is no tenant to cross) — those can stay, or migrate later for consistency, but they are not a security P0.

## 3. Why it can't be batch-scripted

1. Each policy's *other* clauses differ (permission key, scoping fn, `with_check` vs `using`). A regex swap would produce invalid or over/under-permissive policies.
2. `is_admin()` is a **legitimate** super-admin bypass in many places — the goal is to keep the *super-admin* bypass (`is_super_admin()`) and remove only the *institution-scoped-role* bypass (`is_admin()`), replacing it with a tenant-aware check.
3. Some `admin`-role users legitimately need cross-institution access (central staff). Those must move to an explicit `scope='all'` custom role or a `user_institution_access` grant BEFORE their `is_admin()` bypass is removed, or they lose access.

## 4. The safe replacement pattern

For a table **with** `institution_id`, replace:

```sql
is_super_admin() OR is_admin() OR (user_has_permission('x.view') AND role_has_institution_access(institution_id))
```

with:

```sql
is_super_admin()                                             -- keep the TRUE global bypass
OR (user_has_permission('x.view') AND role_has_institution_access(institution_id))
```

`role_has_institution_access()` already honors `institution_scope='all'` roles + `user_institution_access` grants, so a legitimately-global admin who has been given a `scope='all'` custom role (or the grant) still sees everything — but *scoped*, auditable, and revocable, instead of via a hardcoded legacy-role bypass.

## 5. Staged rollout (tranche = one module's tables)

For each tranche:

1. **Enumerate** the module's `institution_id` tables in the 228-set.
2. **Pre-migrate access:** find every user relying on the `is_admin()` bypass for those tables (legacy role in the admin set) and, where cross-institution access is genuinely needed, give them a `scope='all'` custom role or `user_institution_access` grants FIRST.
3. **Rewrite** the policies (drop the `is_admin()` disjunct; keep `is_super_admin()`), one migration per module, mirrored into `supabase/setup/03_policies.sql`.
4. **Impersonation-test** (per `reference_jwt_claims_impersonation_gate_test`): as a plain institution-scoped `admin` user, confirm they can no longer read another institution's rows; as a super-admin, confirm they still can; as an intended-global admin (newly granted `scope='all'`), confirm they still can.
5. **Ship + verify**, then next tranche.

**Suggested tranche order** (highest tenant-sensitivity first): billing → learners/PII → admissions → academic → org → the rest.

## 6. Effort

~228 tables ÷ ~10–15 per tranche ≈ **15–20 tranches**, each a small reviewed PR + impersonation test. This is a multi-session security program, not a single change. It should run as its own initiative with the Director assigning an owner, **not** be folded into feature work.

## 7. Interim mitigation (optional, low-effort)

Audit who currently holds a legacy `admin`/`administrator`/`super_admin` role that is NOT meant to be global, and demote them to a scoped custom role. This shrinks the *actual* exposed population immediately, before the structural fix lands. One query:

```sql
SELECT id, email, role, institution_id FROM profiles
WHERE role IN ('admin','administrator') AND is_super_admin = false;
```
