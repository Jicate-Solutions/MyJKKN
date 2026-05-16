# Admission Counselor Membership — Dual-Table Contract

**Status:** Locked 2026-05-03 by Director decision (P0-3 of 2026-05-03 session brief).

## TL;DR

`admission_counselors` is the **canonical source of truth** for "who can be assigned admission leads." It is **NOT** equivalent to `profiles.role = 'admission_counselor'`.

A user can legitimately appear in `admission_counselors` while holding a different `profiles.role` (e.g., `learner_counselor`, `faculty`, `staff_counselor`). This is **by design** — the platform supports multi-role users where someone holds a primary role but is also designated as an admission counselor for a specific drive/cycle/institution.

## The dual-table model

```
admission_leads.counselor_id          → admission_counselors.id    (legacy column)
admission_leads.assigned_counselor_id → profiles.id                (newer column)
admission_counselors.user_id          → profiles.id
```

The legacy `counselor_id` column resolves through `admission_counselors.user_id` to reach a profile. The newer `assigned_counselor_id` resolves directly to a profile. Both columns may be populated; both should agree on the underlying user.

## WRONG vs CORRECT patterns

### Lead routing & dashboard queries

> "Find leads owned by an admission counselor at this institution"

```ts
// ❌ WRONG — assumes profiles.role is the source of truth
const { data } = await supabase
  .from('admission_leads')
  .select('id, profiles!assigned_counselor_id(role, full_name)')
  .eq('institution_id', instId)
  .eq('profiles.role', 'admission_counselor');
// Misses leads correctly assigned to faculty/learner_counselor users
// who are members of admission_counselors. Caused 2,348 leads to look
// "tainted" in 2026-05-03 audit — they were not.

// ✅ CORRECT — joins through the membership table
const { data } = await supabase
  .from('admission_leads')
  .select('id, admission_counselors!counselor_id(user_id, profiles(full_name))')
  .eq('institution_id', instId)
  .not('counselor_id', 'is', null);
```

### Counting "active admission counselors"

```sql
-- ❌ WRONG
SELECT COUNT(*) FROM profiles WHERE role = 'admission_counselor' AND is_active;

-- ✅ CORRECT
SELECT COUNT(DISTINCT ac.user_id)
FROM admission_counselors ac
JOIN profiles p ON p.id = ac.user_id
WHERE p.is_active;
```

### Filtering for counselor-eligible profiles in raw SQL functions

The setup-functions in `supabase/setup/02_functions.sql` use `WHERE p.role IN ('admission_counselor', 'expo_counselor', 'admission_staff', 'cbo')` patterns. **These are correct** when the function is enumerating role-permission scope (e.g., "what roles get to access the admission module"). They become wrong only when used as a substitute for `admission_counselors` membership in lead-routing or dashboard queries.

## CI guard

`scripts/check-admission-counselor-membership.mjs` flags the highest-risk drift pattern (`.eq('role', 'admission_counselor')` in Supabase JS chains) outside whitelisted paths. Run via `npm run check:admission-counselor-membership` or as part of `npm run check:menus`.

The guard is intentionally narrow — it catches the JS-side bug class shown above without flagging legitimate role-filter SQL in setup functions / migrations. Reviewers should still apply judgment on dashboard queries that join through `profiles.role` for counselor counts.

## Reference

- 2026-05-03 audit: 2,348 leads with legitimate dual-role assignments (1,448 Pharmacy / 896 Nursing / 3 Testing / 1 Dental). All preserved in place per Director decision.
- Memory: `feedback_admission_leads_counselor_id_fk_drift.md` — the FK targets-different-tables rule.
- PR: this file ships alongside `scripts/check-admission-counselor-membership.mjs`.
