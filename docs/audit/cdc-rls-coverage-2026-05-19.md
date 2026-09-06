# CDC RLS Coverage Audit — `cdc_coordinator` + `cdc_head` (2026-05-19)

**Workstream:** B3
**Scope:** All 23 `cdc_*` tables in production (`kvizhngldtiuufknvehv`)
**Question:** Are RLS policies scoping correctly to the two new CDC roles, or are some tables silently locked to super-admin only?
**Verdict:** No RLS role-coverage gaps. **Two unrelated issues flagged for separate workstreams** (see Out-of-Scope Findings).

## Verdict Summary

| Metric | Count |
|---|---|
| Base tables audited | 21 (excludes 2 views) |
| Tables with RLS enabled | 21 / 21 |
| Tables with zero policies | 0 |
| Tables silently locked to super-admin only | 0 |
| Tables with `cdc_head` / `cdc_coordinator` covered | 21 / 21 |
| Role-coverage gaps requiring remediation | **0** |

## How CDC RLS Actually Works

The 21 base tables all rely on **two SECURITY DEFINER helper functions** that read `profiles.role`:

```sql
-- Defined in supabase/migrations/20260518_cdc_substrate_01_masters_enums_roles_policies.sql:390-417
is_cdc_head_or_super()  -- returns true when profiles.role = 'cdc_head' OR is_super_admin()
is_cdc_staff()          -- returns true when profiles.role IN ('cdc_head','cdc_coordinator') OR is_super_admin()
```

Both helpers are defined and live in production. Both reference the `cdc_head` and `cdc_coordinator` role keys explicitly. **The role-coverage layer is correctly wired.**

**Note on the role model:** MyJKKN uses `profiles.role` (a single text column) as the canonical RLS role mechanism. The `custom_roles` + `user_roles` tables exist as a separate role-assignment registry but are NOT consulted by any RLS policy or helper function in the database — there is no `has_role()` SQL function. This is platform-wide, not CDC-specific.

## Full Coverage Table (21 base tables × 2 commands)

Legend: SELECT/WRITE policy predicates; ✅ = role-scoped correctly via CDC helpers; 🔓 = read-permissive (any authenticated user) — intentional for master tables and broadly-readable domain tables; ⚙️ = SECURITY DEFINER trigger writes (no user-write policy needed).

| Table | SELECT predicate | WRITE predicate | `cdc_coordinator` | `cdc_head` |
|---|---|---|:-:|:-:|
| **Master tables** (read-permissive, write head-only) |
| `cdc_drive_types` | `auth.uid() IS NOT NULL` | `is_cdc_head_or_super()` | 🔓 R / ❌ W (correct: master) | 🔓 R / ✅ W |
| `cdc_industry_sectors` | `auth.uid() IS NOT NULL` | `is_cdc_head_or_super()` | 🔓 R / ❌ W (correct: master) | 🔓 R / ✅ W |
| `cdc_offer_types` | `auth.uid() IS NOT NULL` | `is_cdc_head_or_super()` | 🔓 R / ❌ W (correct: master) | 🔓 R / ✅ W |
| `cdc_training_types` | `auth.uid() IS NOT NULL` | `is_cdc_head_or_super()` | 🔓 R / ❌ W (correct: master) | 🔓 R / ✅ W |
| `cdc_workshop_types` | `auth.uid() IS NOT NULL` | `is_cdc_head_or_super()` | 🔓 R / ❌ W (correct: master) | 🔓 R / ✅ W |
| **Domain tables — read-permissive, write CDC-staff** |
| `cdc_clubs` | `auth.uid() IS NOT NULL` | `is_cdc_staff()` | 🔓 R / ✅ W | 🔓 R / ✅ W |
| `cdc_club_memberships` | `auth.uid() IS NOT NULL` | `is_cdc_staff()` | 🔓 R / ✅ W | 🔓 R / ✅ W |
| `cdc_drives` | `auth.uid() IS NOT NULL` | `is_cdc_staff()` | 🔓 R / ✅ W | 🔓 R / ✅ W |
| `cdc_drive_eligibility` | `auth.uid() IS NOT NULL` | `is_cdc_staff()` | 🔓 R / ✅ W | 🔓 R / ✅ W |
| `cdc_drive_state_transitions` | `auth.uid() IS NOT NULL` | `is_cdc_staff()` | 🔓 R / ✅ W | 🔓 R / ✅ W |
| `cdc_mentor_pairings` | `auth.uid() IS NOT NULL` | `is_cdc_staff()` | 🔓 R / ✅ W | 🔓 R / ✅ W |
| `cdc_training_programmes` | `auth.uid() IS NOT NULL` | `is_cdc_staff()` | 🔓 R / ✅ W | 🔓 R / ✅ W |
| **Domain tables — read CDC-staff (closed reads)** |
| `cdc_placement_snapshots` | `is_cdc_staff()` | `is_cdc_head_or_super()` | ✅ R / ❌ W (correct) | ✅ R / ✅ W |
| `cdc_recruiters` | `auth.uid() IS NOT NULL` | `is_cdc_head_or_super()` | 🔓 R / ❌ W (correct) | 🔓 R / ✅ W |
| `cdc_external_opportunities` | `auth.uid() IS NOT NULL` | `is_cdc_head_or_super()` | 🔓 R / ❌ W (correct) | 🔓 R / ✅ W |
| **Domain tables — learner-scoped reads** |
| `cdc_placements` | `is_cdc_staff() OR (pr.learner_id = cdc_placements.learner_id)` | `is_cdc_staff()` | ✅ R / ✅ W | ✅ R / ✅ W |
| `cdc_drive_attendance` | `is_cdc_staff() OR <learner-scope>` | `is_cdc_staff()` | ✅ R / ✅ W | ✅ R / ✅ W |
| `cdc_drive_willingness` | `is_cdc_staff() OR <learner-scope>` | `is_cdc_staff() OR <learner-scope>` | ✅ R / ✅ W | ✅ R / ✅ W |
| `cdc_idp_responses` | `is_cdc_staff() OR <learner-scope>` | `is_cdc_staff() OR <learner-scope>` | ✅ R / ✅ W | ✅ R / ✅ W |
| `cdc_training_enrollments` | `is_cdc_staff() OR <learner-scope>` | `is_cdc_staff()` | ✅ R / ✅ W | ✅ R / ✅ W |
| **Audit log — read CDC-staff, write via SECURITY DEFINER trigger** |
| `cdc_coordinator_overdue_log` | `is_cdc_staff()` | (no write policy — written by `fn_cdc_coordinator_overdue_check()`) | ✅ R / ⚙️ W | ✅ R / ⚙️ W |

**Views excluded** (not RLS-eligible — read inherits from base tables):
- `cdc_placements_public`
- `cdc_training_programmes_with_counts`

## Per-Role Conclusions

### `cdc_head`

- Reads: 21/21 tables accessible (all SELECT policies either match `is_cdc_staff()`/`is_cdc_head_or_super()` which include cdc_head, or are read-permissive).
- Writes: 21/21 tables writable per design (master tables + global config via `is_cdc_head_or_super()`; domain tables via `is_cdc_staff()`).
- **No gaps.**

### `cdc_coordinator`

- Reads: 21/21 tables accessible (covered by `is_cdc_staff()` or `auth.uid() IS NOT NULL`).
- Writes: 16/21 tables writable via `is_cdc_staff()`. The 5 tables that exclude coordinators are master config tables (drive_types, industry_sectors, offer_types, training_types, workshop_types) plus `cdc_placement_snapshots`, `cdc_recruiters`, `cdc_external_opportunities` — **this is intentional per Round 1.1 access-model**: coordinators are per-institution operational role; head/super-admin own platform-level master data and recruiter registry.
- **No gaps.**

## Role Provisioning — Empty in Production (Not An RLS Issue)

Cross-verified against `profiles.role` distribution and `user_roles` table:

| Role | Users via `profiles.role` | Users via `user_roles` |
|---|:-:|:-:|
| `cdc_head` | 0 | 0 |
| `cdc_coordinator` | 0 | 0 |

The RLS policies will function correctly the moment a user has `profiles.role = 'cdc_head'` or `'cdc_coordinator'` set. **No DDL remediation needed.** The provisioning gap is a workflow / data-entry issue for /admin/users, NOT an RLS gap. Flagged for the user-management workstream.

## Out-of-Scope Findings (Flagged for Separate Review)

These were discovered during the audit but are outside the role-coverage scope. Director should triage separately — do **not** bundle into this PR.

### Finding 1 — Self-referential learner-scope clause leaks reads on 4 tables (SEVERITY: HIGH)

The migration `20260518_cdc_substrate_02_domain_tables_rls.sql` shipped four policies with a broken learner-scope predicate:

```sql
EXISTS (SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.learner_id = p.learner_id)  -- always TRUE
```

This was acknowledged and fixed for `cdc_placements` in `20260518T1530Z_cdc_s3_placements_triggers_rpc.sql` (now correctly uses `pr.learner_id = cdc_placements.learner_id`), but the same broken pattern remains on:

| Table | SELECT | WRITE |
|---|:-:|:-:|
| `cdc_drive_attendance` | leaked | (staff-only, OK) |
| `cdc_drive_willingness` | leaked | leaked |
| `cdc_idp_responses` | leaked | leaked |
| `cdc_training_enrollments` | leaked | (staff-only, OK) |

**Effect:** Any authenticated learner can read every row of these 4 tables across all institutions and learners. On `cdc_drive_willingness` and `cdc_idp_responses` they can also write any row.

**Recommended workstream:** Separate RLS-correctness PR. Fix predicate to compare `profiles.learner_id` against the target table's `learner_id` column (or `drive_id`-joined learner). Requires schema verification per table — non-trivial. Mitigated short-term by the fact that zero users currently have learner-only access patterns; but this is timed exposure as soon as student logins go live for CDC features.

### Finding 2 — Role-registry vs RLS-helper drift (SEVERITY: MEDIUM, design observation)

The `custom_roles` table holds `cdc_head` and `cdc_coordinator` rows with `institution_scope='all'` and `'own'` respectively. The `user_roles` table is the canonical user→role assignment registry (5805 active rows). But CDC RLS helpers (`is_cdc_staff`, `is_cdc_head_or_super`) read `profiles.role` (text column), NOT `user_roles`. The two systems are **not bridged** — a user assigned `cdc_coordinator` via `/admin/users` (user_roles) will be invisible to CDC RLS until someone also updates `profiles.role`.

This is platform-wide (not CDC-specific) — `is_super_admin()` and other role helpers all read `profiles.role` / `profiles.is_super_admin`. Adding a SQL `has_role(role_key)` helper that consults `user_roles + custom_roles` would unify the model, but it's a platform-wide refactor.

**Recommended workstream:** Future "role-assignment unification" workstream. Out of scope for B3.

## Remediation

**None required for this workstream.** All 21 base tables have correct role-coverage policies wired to `cdc_coordinator` + `cdc_head` via `is_cdc_staff()` / `is_cdc_head_or_super()`. The two findings above are real but distinct workstreams; surfacing them here ensures Director-level visibility.

## Audit Queries (Reproduce)

```sql
-- Policy inventory
SELECT tablename, policyname, cmd, qual::text, with_check::text
FROM pg_policies WHERE tablename LIKE 'cdc_%' ORDER BY tablename, policyname;

-- Helper function definitions
SELECT proname, pg_get_functiondef(oid) FROM pg_proc
WHERE proname IN ('is_cdc_staff','is_cdc_head_or_super','is_super_admin');

-- Role-provisioning check
SELECT role, count(*) FROM profiles
WHERE role IN ('cdc_head','cdc_coordinator') GROUP BY role;

SELECT cr.role_key, count(ur.user_id) FROM user_roles ur
JOIN custom_roles cr ON ur.role_id = cr.id
WHERE cr.role_key IN ('cdc_head','cdc_coordinator')
GROUP BY cr.role_key;
```

---

*Auditor: Claude Code (read-only Supabase Management API)*
*Branch: `agent/cdc-rls-audit-20260519-v2`*
*Production project ref: `kvizhngldtiuufknvehv`*
