# BOS Module Role Access Investigation

## Overview

The BOS (Board of Studies) module implements a sophisticated dual-layer authorization system:
1. **Role-Permission Layer** — traditional RBAC with permission keys stored in `custom_roles.permissions` JSONB
2. **Board-Membership Layer** — composition-based scoping that gates actual write operations

This document maps the architecture, identifies key design patterns, and highlights critical behaviors.

---

## Architecture Overview

### Three-Tier Permission Source

Permissions live in three independent layers that can drift:

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. RUNTIME SOURCE OF TRUTH: custom_roles.permissions JSONB      │
│    (DB-driven, checked at authorization time)                   │
└─────────────────────────────────────────────────────────────────┘
                               ↑
              ┌────────────────┴────────────────┐
              │                                 │
┌─────────────────────────────┐  ┌──────────────────────────────┐
│ 2. TS Seed Defaults         │  │ 3. RLS (implicit)            │
│  (bos-role-permissions.ts)  │  │ Also reads the DB JSONB      │
│  Used only when DB has      │  │                              │
│  ZERO academic.bos-* keys   │  │                              │
└─────────────────────────────┘  └──────────────────────────────┘
```

**Critical Insight:** Once ANY `academic.bos-*` key is granted to a role in the DB, the TypeScript defaults become **permanently bypassed** — the fallback in `applyBOSFallback()` only applies when zero keys exist.

### Permission Key Format (Canonical)

All permissions use the **dot-format** with the `academic.bos-` prefix:

```
academic.bos-syllabus.view
academic.bos-syllabus.create
academic.bos-syllabus.edit
academic.bos-courses.create
academic.bos-compositions.edit
academic.bos-meetings.view
... etc
```

⚠️ **Format Confusion History:**
- `academic.bos-syllabus.*` ✅ **Canonical (in use)**
- `bos.syllabus.*` ❌ Bug — code looked for this in `use-bos-permissions.ts` pre-2026-05-16 but DB never had these keys
- `bos.syllabi.*` ❌ Legacy — found in old migrations and tests, superseded by 20260511 rename

---

## Dual-Layer Authorization Pattern

### Layer 1: Role-Permission Gates (RBAC)

**Where it's checked:**
- Client: `hooks/use-permissions.ts`, `BosViewGuard`, `PermissionGuard` components
- Server: `canAccessBos()` RPC call in API routes
- Breadcrumb sidebar visibility: `MENU_PERMISSIONS['/bos']` requires `bos.view`

**How it works:**
```typescript
// Client-side
const { canAccess } = usePermissions();
canAccess('academic.bos-syllabus', 'create')  // checks merged_permissions JSONB

// Server-side
await canAccessBos(userId, 'academic.bos-syllabus', 'view')  // calls user_has_permission() RPC
```

**Default assignments by role** (`lib/services/bos/bos-role-permissions.ts`):

| Role | Syllabi | Compositions | Meetings | Courses | TA-DA |
|------|---------|--------------|----------|---------|-------|
| Super Admin | all | all | all | all | all |
| Administrator | all | all | all | all | all |
| Principal | view, export | view, create, edit | view, create, edit | view | view |
| HOD | view, create, edit, revise, duplicate, export | view, create, edit | view, create, edit | view, create, edit, import | view, submit |
| Faculty | view, create, edit, revise, duplicate, export | view, edit | view, edit | view, create, edit | view, submit |
| Coordinator | view, create, edit, export | view, create, edit | view, create, edit | view, create, edit | view, submit |
| Default | view | view | view | view | view |

### Layer 2: Board-Membership Gates (Composition-Scoped)

**Where it's checked:**
- Client: `useBosBoardScope()` hook — resolves active compositions via `/api/bos/scope`
- Server: `resolveBosBoardScope()` in `lib/utils/bos/bos-access.ts` — queries `bos_members` + embedded FK joins

**What it gates:**
- Write operations: create/edit/delete syllabi, meetings, members, compositions
- List visibility: filter tables by `memberOf` (for non-principals, non-admins)

**Scope resolution flow:**

```
resolveBosBoardScope(userId)
  ↓
  1. Get user's staff.id from staff table (profile_id FK)
  2. Query bos_members where staff_id = me AND is_active = true
  3. Join to bos_compositions (active only)
  4. Extract:
     - memberOf: Set of composition_ids
     - isChairmanIn: Set of composition_ids where member_type='chairman'
     - boardsOf: Set of board_ids (from compositions)
     - chairmanForBoards: Set of board_ids (where user chairs ≥1 comp)
     - institutionsOf: Set of institution_ids (from compositions)
```

**Key guard functions:**

```typescript
// Composition write (courses, meetings, ta-da, members)
guardCompositionWrite(scope, compositionId)
  → allows: super-admin OR membership in that composition
  → denies: principals, non-members

// Composition-level operations (edit comp itself, manage members, delete)
guardCompositionChairman(scope, compositionId)
  → allows: super-admin OR chairman of that composition
  → denies: all others including members and principals

// Syllabus write (board_id only, not composition_id)
guardSyllabusEdit(scope, syllabus, currentUserId)
  → allows: creator OR board chairman OR super-admin
  → denies: other members who didn't create

// Course write (multi-institution support)
guardCourseInstitutionWrite(scope, targetInstitutionId)
  → allows: super-admin OR primary institution OR institutionsOf
  → denies: users outside those institutions
```

---

## Client-Side Implementation

### View Access (`BosViewGuard`)

Grants access if EITHER:
1. User has `<module>.view` permission in their role, OR
2. User is a member of ≥1 active bos_members row

```typescript
// BosViewGuard: routes/bos/syllabus/page.tsx
<BosViewGuard module='academic.bos-syllabus'>
  {children}
</BosViewGuard>

// Internal logic
if (scope.hasAnyAccess)  // super-admin OR principal OR memberOf.size > 0
  return children
else
  return <PermissionGuard module='academic.bos-syllabus' action='view' />
```

**Why this dual-gate?** Composition members frequently lack the matching role-permission key in the DB (known drift issue). Gating only on role would hide the page from legitimate board members.

### Create Actions

Buttons check **membership only**, NOT role permissions:

```typescript
// syllabus-actions.tsx
const isBoardMember = boardScope.memberOf.size > 0;
const canCreate = isSuperAdmin || isBoardMember;

// Edit affordances
const canEdit = canEditSyllabus(scope, syllabus, authUserId);
// → checks: creator OR board-chairman OR super-admin
```

**Rationale:** Role-permission grants drift out of sync with actual composition membership. A faculty member on a board often lacks `academic.bos-syllabus.create` in the DB despite being the intended creator. Membership is the ground truth for actual BoS participation.

### Scope Hook Integration

```typescript
// hooks/bos/use-bos-board-scope.ts
export function useBosBoardScope(): BosBoardScopeClient {
  const { data } = useQuery({
    queryKey: bosBoardScopeKey(userId),
    queryFn: () => fetch('/api/bos/scope').then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: !!userId,
  });
  
  return {
    isSuperAdmin: data.isSuperAdmin,
    isPrincipal: data.isPrincipal,
    hasAnyAccess: super_admin || principal || memberOf.length > 0,
    memberOf: new Set(data.memberOf),
    isChairmanIn: new Set(data.isChairmanIn),
    boardsOf: new Set(data.boardsOf),
    chairmanForBoards: new Set(data.chairmanForBoards),
    institutionsOf: new Set(data.institutionsOf),
    ...
  };
}
```

**Cache key includes userId** — prevents cross-user data leaks when QueryClient is module-level singleton (documented in [[React Query Cross-User Cache Leak]])

---

## Server-Side Implementation

### API Route Pattern

All write endpoints follow this pattern:

```typescript
// Step 1: Authenticate
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401;

// Step 2: Resolve scope
const scope = await resolveBosBoardScope(user.id);

// Step 3: Apply institution/composition filter
const filter = compositionScopeFilter(scope);
if (filter.kind === 'none') return empty_list;

// Step 4: Enforce on each mutation
const error = guardCompositionWrite(scope, targetCompositionId);
if (error) return 403;

// Step 5: Query with RLS + FK enforcement
const data = await supabase
  .from('bos_syllabi')
  .select('*')
  .in('board_id', scope.boardsOf);  // filter by membership
```

### Role-Permission Check (Server)

```typescript
// lib/utils/bos/bos-access.ts: canAccessBos()
export async function canAccessBos(
  userId: string,
  module: BosModule,
  action: BosAction
): Promise<boolean> {
  // 1. Super-admin bypass
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin, role')
    .eq('id', userId)
    .single();
  
  if (profile?.is_super_admin) return true;
  
  // 2. Query custom_roles.permissions via RPC
  // (same source as client-side usePermissions)
  const { data: hasPerm } = await supabase.rpc('user_has_permission', {
    permission_name: `${module}.${action}`,
  });
  
  return hasPerm === true;
}
```

⚠️ **Note:** Most BoS write endpoints do NOT call `canAccessBos()` at the top level. They rely on the lower-layer guards (`guardCompositionWrite`, `guardCourseInstitutionWrite`) to enforce the real boundary. This is intentional — role-permission drift is less critical here because board membership is the actual source of truth.

---

## Key Design Decisions & Rationale

### 1. Membership ≠ Role-Permission Drift Tolerance

| Policy | Reason | Example |
|--------|--------|---------|
| UI shows buttons to board members even if role-perm key is missing | Role grants drift out of sync with composition membership | Faculty on a board sees "New Syllabus" button despite `academic.bos-syllabus.create` missing in DB |
| Server gates on membership (composition ID), not role | Membership is the real authorization boundary | `guardCompositionWrite()` doesn't call `canAccessBos()` first |
| View-level gates check BOTH membership + role | Members shouldn't see pages they can't access, and role-only gatekeepers should still work | BosViewGuard checks `memberOf.size > 0 OR canAccess('view')` |

### 2. Multi-Institution Support via `institutionsOf`

Faculty members can serve on boards under multiple institutions. The system tracks this:

```typescript
// Instead of: scope.institutionsId (single)
// Use: scope.institutionsOf (Set of all institutions with active compositions)

// Example: /api/bos/courses-master
// Faculty on Board A (Institution X) + Board B (Institution Y) sees courses from both
const filter = course.institutions_id in scope.institutionsOf;
```

### 3. CAS Institution Awareness

For CAS colleges (Aided + Self-financing with shared `counselling_code`):
- A user whose primary institution is Aided can write to either Aided or Self-financing
- This is surfaced in `scope.allInstitutionIds` (resolved via COE API + fallback to Supabase)
- Checked by `guardInstitutionWrite()` and `guardCourseInstitutionWrite()`

```typescript
// CAS-aware write gate
const allowed = new Set([
  scope.institutionsId,           // primary
  ...scope.allInstitutionIds,     // siblings
  ...scope.institutionsOf,        // all institutions with board membership
]);
if (!allowed.has(targetId)) return 403;
```

### 4. Principal Carve-Out (Read-Only on Board Data)

Principals (governors) have special rules:
- Can READ every composition in their institution(s) via `compositionScopeFilter`
- Cannot WRITE to composition data (use approval-only endpoints instead)
- Cannot CREATE compositions

```typescript
// In compositionScopeFilter:
if (scope.isPrincipal) {
  return { kind: 'byInstitution', ids: scope.allInstitutionIds };
  // Not { kind: 'byComposition', ids: scope.memberOf }
}

// In guardCompositionWrite:
if (scope.isPrincipal) return 'Forbidden: principals are read-only';
```

### 5. Chairman Bootstrap Pattern

A user who creates a composition becomes chairman (and can edit it) even before the `bos_members` chairman row is added:

```typescript
// canEditComposition()
export function canEditComposition(
  scope: BosBoardScopeClient,
  compositionId: string | null | undefined,
  createdByMe?: boolean,  // ← bootstrap: creator can edit before isChairmanIn populates
): boolean {
  if (scope.isSuperAdmin) return true;
  if (createdByMe) return true;  // ← allows the create-then-add-self flow
  return scope.isChairmanIn.has(compositionId);
}
```

---

## Current Role Definitions

### Roles with BOS Access

| Role | System Role Key | Display Name | BOS Purpose |
|------|-----------------|--------------|-------------|
| super_admin | `SYSTEM_ROLES.SUPER_ADMIN` | Super Admin | Full access all modules |
| administrator | `SYSTEM_ROLES.ADMINISTRATOR` | Administrator | Full access all modules |
| principal | `SYSTEM_ROLES.PRINCIPAL` | Principal | Read-only governor/approver |
| hod | `SYSTEM_ROLES.HOD` | HOD | Department board chair/faculty |
| faculty | `SYSTEM_ROLES.FACULTY` | Facilitator / Faculty | Board member (internal) |
| coordinator | (custom role) | Coordinator | Operational support (restricted) |

### Roles with NO BOS Access

- student
- parent
- staff (unless also faculty/hod/principal)
- (any other custom role without explicit grants)

---

## Potential Issues & Edge Cases

### 1. Module-Level QueryClient Singleton (RESOLVED)

**Issue:** `providers/query-client-provider.tsx` exposes a module-level singleton QueryClient. When a user logs out and another logs in, the old user's data could briefly be visible.

**Resolution:** `bosBoardScopeKey(userId)` includes the authenticated user ID, so different users get different cache keys. ✅

**Risk if violated:** Switching accounts shows prior user's board memberships until cache expires or page refreshes.

### 2. Role-Permission Drift (KNOWN & TOLERATED)

**Issue:** DB custom_roles.permissions can be missing keys that the code expects.

**Examples:**
- Faculty member is on a composition but lacks `academic.bos-syllabus.create`
- Role never got the dot-format migration applied

**Mitigation:**
- UI gates on membership (`memberOf.size > 0`) instead of role-perm
- Server gates on membership (composition FK) instead of role-perm
- Run `scripts/diagnose-hod-bos-permissions.mjs` or `scripts/fix-bos-permission-format-drift.sql` to detect/repair

**Acceptance:** This drift is accepted as a trade-off to avoid overly broad role grants. A user's board membership is the ground truth.

### 3. Staff Profile Linking (RESOLVED)

**Issue:** User must have both `profiles(id)` AND `staff(profile_id)` rows to appear in board compositions.

**Where it breaks:**
- Pre-registered users with no staff row: `staffId` is null, `memberOf` is empty
- `staff.user_id` FK doesn't exist — old code using it silently returned null

**Resolution:** 20250121 migration added `staff.profile_id` FK. `resolveBosBoardScope()` uses this now. ✅

**Risk if violated:** Users created via auth alone (not staff registry) never get BoS access even if added to compositions later.

### 4. Composition Delete Block (FK Constraint)

**Issue:** `bos_meetings.composition_id` has NO CASCADE. Deleting a composition that has meetings fails with opaque 500.

**Also:** `bos_members.composition_id` HAS CASCADE — so deleting `bos_members` rows cleans up but deleting the composition doesn't.

**Manifestation:** Created-by-null rows (old data) can only be deleted by super-admin or chairman.

**Diagnosis:** `scripts/inspect-bos-composition-delete.mjs`

### 5. CAS Display Gap in Dropdowns (RESOLVED)

**Issue:** SearchableSelect uses strict `===` comparison on institution IDs. When picking a saved composition with a CAS sibling UUID, the item doesn't match because the user's primary is the other sibling.

**Resolution:** Normalize institutions_id + use `preferId` parameter to suggest the primary. ✅

**Example:** Composition saved under CAS Aided UUID, but user's profile.institution_id is Self-Financing UUID — strict === fails.

### 6. Edit Form Paginated List Gap (KNOWN)

**Issue:** When editing a composition/etc., saved items sometimes disappear from dropdowns if they fall outside the API's first page.

**Mitigation:** Merge in the saved record via single-record GET; don't rely on pagination to include it.

**Example:** Regulation list shows only 50 items per page, but the user's saved regulation is item #75 → dropdown doesn't show the current selection.

---

## Testing & Debugging

### Diagnosing Permission Issues

1. **Check role-permission grants:**
   ```sql
   SELECT role_key, permissions FROM custom_roles WHERE role_key = 'faculty';
   ```
   Look for keys like `'academic.bos-syllabus.view'` (with `academic.` prefix).

2. **Check board membership:**
   ```sql
   SELECT bm.staff_id, bm.composition_id, bc.board_id, bc.institutions_id
   FROM bos_members bm
   JOIN bos_compositions bc ON bm.composition_id = bc.id
   WHERE bm.staff_id = '<staff_id_here>' AND bm.is_active = true;
   ```

3. **Check staff linking:**
   ```sql
   SELECT p.id as user_id, s.id as staff_id, p.role
   FROM profiles p
   LEFT JOIN staff s ON s.profile_id = p.id
   WHERE p.id = '<user_id_here>';
   ```
   If no staff row, user can't be in compositions.

4. **Run diagnosis script:**
   ```bash
   node scripts/diagnose-hod-bos-permissions.mjs --role faculty
   node scripts/inspect-bos-composition-delete.mjs --composition-id <id>
   ```

### Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| "Forbidden: you can only modify data for compositions you belong to" | Not in `bos_members` for that composition_id | Add user to composition via admin |
| "Forbidden: principals have read-only access to board data" | Trying to write as principal | Use principal-only approval endpoints |
| "Forbidden: only the board chairman can modify this composition" | Not chairman (member_type ≠ 'chairman') | Update `bos_members.member_type` |
| "Forbidden: you can only manage BoS records for your own institution" | Target institution not in `scope.institutionsId` or `scope.allInstitutionIds` | Check user's `profile.institution_id` + CAS siblings |

---

## Summary: Key Principles

1. **Membership is authorization** — board membership (composition FK) gates writes, role permissions are a secondary gating layer
2. **Role-permission drift is tolerated** — UI and server both check membership to avoid false 403s when DB grants are missing
3. **CAS-aware institution expansion** — users on multi-institution boards see records from all their board institutions
4. **Principal read-only carve-out** — principals can read every board but can't write field data
5. **Canonical permission key format** — always `academic.bos-<module>.<action>` (dot-format with `academic.` prefix)
6. **Board-level scope caching** — 5-minute client-side cache keyed by user ID to prevent cross-user leaks
7. **Multi-layer guard patterns** — super-admin > membership > role > principal carve-out, with explicit null/undefined checks
