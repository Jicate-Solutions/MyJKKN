# Persona Design PR-1 — Scope Extension Helpers

## Why

MyJKKN's `custom_roles.institution_scope` supports two values: `'all'` | `'own'`. That's enough for traditional roles (super_admin sees all institutions, staff sees own institution), but can't express three increasingly common patterns:

| Scope shape | Role example | Can current model express it? |
|---|---|---|
| Block-level (user sees only their assigned block) | Warden of Boys Block A | ❌ No — 'own' is institution-wide |
| Relationship (user sees only a specific related user) | Parent of learner X | ❌ No — parents don't belong to an institution at all |
| Contract (external party sees only their contract) | Mess caterer for College Y | ❌ No — externals don't map to any institution scope |

The Campus Living module surfaced all three needs simultaneously. Rather than hardcode them in RLS policies on 48 hostel_*/mess_* tables (a well-known anti-pattern per CLAUDE.md Role Management section), this PR introduces three generic, reusable helpers that mirror the existing `role_has_institution_access()` pattern.

## What this PR adds

### 3 junction tables (in `supabase/setup/01_tables.sql`)

1. **`user_block_access`** — grants a user access to a specific hostel block.
   - Used by wardens, gate security, housekeeping staff.
   - Soft-delete via `revoked_at` (preserves audit trail).

2. **`user_learner_relationship`** — declares a family relationship between a user and a learner.
   - Primary use: parent portal.
   - `relationship` enum: parent / guardian / sibling / spouse / legal_guardian.
   - `verified_at` required — unverified relationships do NOT get access.

3. **`user_contract_access`** — grants an external vendor/caterer access to their contract.
   - `contract_type` enum: caterer / maintenance_vendor / laundry_vendor / amc / other.
   - `contract_id` is polymorphic (points to mess_caterers.id OR resource_vendor_contracts.id depending on type) — FK not enforced at DB level; application layer validates on INSERT.

### 3 SECURITY DEFINER functions (in `supabase/setup/02_functions.sql`)

All three follow an identical shape matching `role_has_institution_access()`:

```sql
CREATE OR REPLACE FUNCTION role_has_<dimension>_access(check_<target>_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF check_id IS NULL THEN RETURN true; END IF;   -- system-wide records
    IF is_super_admin() THEN RETURN true; END IF;   -- super admin bypass
    RETURN EXISTS (/* consult junction table */);
END;
$$;
```

- `role_has_block_access(check_block_id uuid)` — for hostel_* tables
- `role_has_relationship_access(check_learner_id uuid)` — for parent portal
- `role_has_contract_access(check_contract_id uuid, check_contract_type text DEFAULT NULL)` — for vendor portals

### RLS on the junction tables themselves (in `supabase/setup/03_policies.sql`)

Standard contract:
- `is_super_admin() OR is_admin()` — full CRUD
- `user_id = auth.uid()` — user can SELECT their own grants
- `user_has_permission('users.block_access.view' | '.manage')` — delegated admin access

### Permission keys referenced but not yet added

PR-1 references six new permission keys in its RLS policies:
- `users.block_access.view`, `users.block_access.manage`
- `users.relationship.view`, `users.relationship.manage`
- `users.contract_access.view`, `users.contract_access.manage`

These keys are NOT added to `PERMISSION_CATEGORIES` in PR-1 — that happens in PR-3. Until PR-3 lands, only `is_super_admin()` / `is_admin()` users can read/write these junction tables. That's fine because no other role can USE them anyway until PR-2.

## What this PR does NOT do

- Does not add any roles (PR-2 adds `warden`, `parent`, `gate_security`, `mess_caterer`, 6 more)
- Does not populate `PERMISSION_CATEGORIES` (PR-3 adds ~120 campus_living.* keys + the 6 users.*.access keys above)
- Does not retrofit RLS on any hostel_*/mess_* tables (PR-4 does the 48-table retrofit using these helpers)
- Does not grant any existing user access to any block/relationship/contract (grants happen through the Role Management UI after PR-4 ships warden flow)

## Test plan

On production DB (via Supabase Dashboard SQL Editor, NOT via the read-only MCP):

```sql
-- 1. Tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('user_block_access','user_learner_relationship','user_contract_access');
-- Expect: 3 rows

-- 2. Functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema='public'
  AND routine_name IN ('role_has_block_access','role_has_relationship_access','role_has_contract_access');
-- Expect: 3 rows

-- 3. NULL target returns TRUE (system-wide records)
SELECT role_has_block_access(NULL), role_has_relationship_access(NULL), role_has_contract_access(NULL, NULL);
-- Expect: t | t | t

-- 4. Non-super_admin, no grant returns FALSE for a random UUID
-- (run as a non-super-admin session — through auth)
SELECT role_has_block_access('00000000-0000-0000-0000-000000000001'::uuid);
-- Expect: f
```

## PR sequence

| PR | Scope | Depends on |
|---|---|---|
| **PR-1 (this)** | Scope helper tables + functions + their RLS | — |
| PR-2 | 10 new roles (warden, chief_warden, gate_security, housekeeping_staff, parent, mess_caterer, maintenance_vendor, hostel_office, anti_ragging_member, accreditation_officer) | PR-1 |
| PR-3 | ~120 permission keys in `PERMISSION_CATEGORIES` for campus_living.* + the 6 users.*.access keys this PR references | — (independent of PR-1, but landing PR-3 before PR-1 means PR-1 RLS rules reference known keys) |
| PR-4 | RLS retrofit on all 48 hostel_*/mess_* tables to use these helpers | PR-1, PR-2, PR-3 |

## Related

- Persona matrix reference: `~/.claude/skills/persona-design/reference/myjkkn-campus-living.md`
- Skill: `~/.claude/skills/persona-design/SKILL.md` — first mandatory gate in `/myjkkn-chain`
- CLAUDE.md Role Management section — the permission/scope architecture this extends
