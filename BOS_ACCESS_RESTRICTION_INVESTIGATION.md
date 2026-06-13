# BOS Module Access Restriction Investigation

## Requirement
**BOS module pages should be accessible ONLY to:** `faculty`, `hod`, `principal`, `super_admin`

All other roles (student, staff, parent, guest, driver, coordinator, nif_coordinator, etc.) should be **denied access**.

---

## Current State: ❌ GAPS FOUND

### Gap 1: Generic "Default" Role Allows View Access

**Location:** `lib/services/bos/bos-role-permissions.ts:108-119`

```typescript
// DEFAULT (no specific role): View only
default: {
  [BOS_MODULES.SYLLABI]: ['view'],
  [BOS_MODULES.TAXONOMY]: ['view'],
  [BOS_MODULES.EXPERTS]: ['view'],
  [BOS_MODULES.COMPOSITIONS]: ['view'],
  [BOS_MODULES.MEETINGS]: ['view'],
  [BOS_MODULES.TA_DA]: ['view'],
  [BOS_MODULES.REPORTS]: ['view'],
  [BOS_MODULES.COURSES]: ['view'],
  [BOS_MODULES.SCHEME]: ['view'],
},
```

**Problem:** 
- Any role NOT in the defined list (student, staff, parent, guest, driver, etc.) falls back to `default` 
- `default` grants view access to ALL BOS modules
- Students can land on `/bos/syllabus` and see an empty list but don't get a 403

**Impact:**
```typescript
// getRolePermissions('student') → DEFAULT_ROLE_PERMISSIONS.default
// Result: student gets view access to all BOS modules ❌
getRolePermissions('parent') → DEFAULT_ROLE_PERMISSIONS.default
// Result: parent gets view access to all BOS modules ❌
```

### Gap 2: Coordinator Role Has BOS Access

**Location:** `lib/services/bos/bos-role-permissions.ts:95-106`

```typescript
// Coordinator: Can help manage BOS operations
coordinator: {
  [BOS_MODULES.SYLLABI]: ['view', 'create', 'edit', 'export'],
  [BOS_MODULES.TAXONOMY]: ['view'],
  [BOS_MODULES.EXPERTS]: ['view', 'create', 'edit'],
  [BOS_MODULES.COMPOSITIONS]: ['view', 'create', 'edit'],
  [BOS_MODULES.MEETINGS]: ['view', 'create', 'edit'],
  [BOS_MODULES.TA_DA]: ['view', 'submit'],
  [BOS_MODULES.REPORTS]: ['view'],
  [BOS_MODULES.COURSES]: ['view', 'create', 'edit'],
  [BOS_MODULES.SCHEME]: ['view'],
},
```

**Problem:** 
- Coordinator is defined with BOS access
- Not one of the 4 approved roles
- Should be removed or explicitly denied

**Impact:**
```typescript
// getRolePermissions('coordinator') → full BOS access ❌
// Coordinator is NOT in the approved list (faculty, hod, principal, super_admin)
```

### Gap 3: View Guard Has Membership Bypass

**Location:** `components/auth/bos-view-guard.tsx:54`

```typescript
// Composition member, principal, or super-admin: grant access regardless
// of whether the role-permission key exists in custom_roles.permissions.
if (scope.hasAnyAccess) return <>{children}</>;

// Fall back to the standard role-permission check so non-members who
// legitimately hold the permission (e.g. administrator) still pass.
return (
  <PermissionGuard module={module} action='view' fallback={fallback}>
    {children}
  </PermissionGuard>
);
```

**Problem:**
- If scope.hasAnyAccess = true, page shows (super_admin OR principal OR board member)
- This allows faculty/hod who are board members to see the page regardless of role perms
- Then it falls back to PermissionGuard which checks role perms
- PermissionGuard will allow view if role has the permission OR role falls back to 'default'

**Current Flow for a Student:**
```
1. useBosBoardScope() → memberOf.length = 0 (not on any board)
2. hasAnyAccess = false
3. Falls back to PermissionGuard
4. canAccess('academic.bos-syllabus', 'view') checks:
   - User merged_permissions? No
   - Fall back to getRolePermissions('student')? Yes → default
   - default has view? Yes ✅
5. Student sees the page ❌
```

---

## Required Changes

### Change 1: Remove "Default" Role BOS Permissions

**File:** `lib/services/bos/bos-role-permissions.ts`

```typescript
// BEFORE (lines 108-119):
default: {
  [BOS_MODULES.SYLLABI]: ['view'],
  [BOS_MODULES.TAXONOMY]: ['view'],
  // ... all modules ...
},

// AFTER:
default: {
  // BOS is NOT open to default role
  // Only: faculty, hod, principal, super_admin allowed
},
// OR
default: {}, // Empty object
```

**Impact:**
- Any role without explicit entry will get NO permissions
- Students, staff, parent, guest, driver → 403 Forbidden

### Change 2: Remove Coordinator BOS Access

**File:** `lib/services/bos/bos-role-permissions.ts`

```typescript
// BEFORE (lines 95-106):
coordinator: {
  [BOS_MODULES.SYLLABI]: ['view', 'create', 'edit', 'export'],
  [BOS_MODULES.TAXONOMY]: ['view'],
  // ... full BOS access ...
},

// AFTER - Option A: Remove completely
// Delete the entire 'coordinator' entry

// OR Option B: Explicitly deny BOS
coordinator: {
  // No BOS modules — only other app permissions
},
```

**Impact:**
- Coordinators will be denied BOS access unless explicitly granted via custom_roles

### Change 3: Update applyBOSFallback() Logic (if needed)

**File:** `lib/services/bos/bos-role-permissions.ts:177-199`

The fallback function seeds defaults when role has ZERO `academic.bos-*` keys:

```typescript
export function applyBOSFallback(
  flatPerms: Record<string, boolean>,
  roleKeys: string[]
): void {
  const hasBOS = Object.keys(flatPerms).some((k) => k.startsWith('academic.bos'));
  if (!hasBOS) {
    for (const roleKey of roleKeys) {
      const defaultPerms = getRolePermissions(roleKey);
      // ↑ This will return empty {} for default role
      for (const [module, actions] of Object.entries(defaultPerms)) {
        // Empty object → no iterations → no fallback applied
        // ✅ Good: Students won't get seeded with fallback
      }
    }
  }
}
```

**Note:** This function should work fine once Changes 1 & 2 are applied. No modification needed if default and coordinator are emptied.

---

## Testing the Fix

### Test Case 1: Student Accessing /bos/syllabus

```typescript
// BEFORE
const perms = getRolePermissions('student');
// → DEFAULT_ROLE_PERMISSIONS.default
// → { syllabi: ['view'], ... }
// ❌ Student can access

// AFTER
const perms = getRolePermissions('student');
// → DEFAULT_ROLE_PERMISSIONS.default
// → {} (empty)
// ✅ Student gets 403
```

### Test Case 2: Faculty with Board Membership

```typescript
// BEFORE & AFTER
const perms = getRolePermissions('faculty');
// → DEFAULT_ROLE_PERMISSIONS.faculty
// → { syllabi: ['view', 'create', ...], ... }
// + useBosBoardScope() finds composition membership
// ✅ Faculty can access
```

### Test Case 3: Coordinator (Previously Allowed)

```typescript
// BEFORE
const perms = getRolePermissions('coordinator');
// → DEFAULT_ROLE_PERMISSIONS.coordinator
// → { syllabi: ['view', 'create', ...], ... }
// ❌ Coordinator can access (not approved)

// AFTER
const perms = getRolePermissions('coordinator');
// → DEFAULT_ROLE_PERMISSIONS.coordinator
// → {} (empty, unless custom_role assigned)
// ✅ Coordinator gets 403 unless explicitly granted via custom_roles
```

### Test Case 4: Super Admin

```typescript
// BEFORE & AFTER
if (profile.is_super_admin === true) {
  return { isSuperAdmin: true, permissions: {} };
}
// ✅ Super admin always can access (hardcoded bypass)
```

---

## Complete View Access Flow After Fix

```
User tries to access /bos/syllabus

┌─────────────────────────────────────────┐
│ BosViewGuard wraps the page            │
└─────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────┐
│ useBosBoardScope() resolves scope      │
│ - isSuperAdmin? YES → hasAnyAccess=true│
│ - isPrincipal? YES → hasAnyAccess=true │
│ - memberOf.size > 0? YES → has...=true │
│ - Otherwise? → hasAnyAccess=false      │
└─────────────────────────────────────────┘
           ↓
       hasAnyAccess?
        /          \
      YES           NO
      ↓             ↓
    Show page    PermissionGuard
                    ↓
            canAccess('academic.bos-syllabus','view')?
                  /              \
                YES              NO
                ↓                ↓
          Show page        Show fallback (403)
          
                
                
              AFTER FIX:
              
When role falls back to getRolePermissions():
- faculty, hod, principal → has 'view' → ✅
- student, staff, parent, coordinator, guest, driver → empty {} → ❌
- super_admin → hardcoded bypass → ✅
```

---

## API Endpoint Impact

All `/api/bos/*` GET endpoints use `compositionScopeFilter()`:

```typescript
// app/api/bos/syllabus/route.ts
const scope = await resolveBosBoardScope(user.id);
const scopeFilter = compositionScopeFilter(scope);

if (scopeFilter.kind === 'none') {
  return NextResponse.json({ data: [] }); // Empty result, not 403
}
```

**Current behavior for student with NO board membership:**
- `compositionScopeFilter()` returns `{ kind: 'none' }`
- API returns empty array (200 OK, but no data)
- ❌ Student can call the API successfully

**After this fix:**
- BosViewGuard will block the page with 403 before the API is even called
- ✅ Student never reaches the API

---

## Recommended Implementation

### Option A: Minimal (Recommended)

**Change 1:** Replace default role with empty object

```typescript
// lib/services/bos/bos-role-permissions.ts, line 108-119

// BEFORE
default: {
  [BOS_MODULES.SYLLABI]: ['view'],
  [BOS_MODULES.TAXONOMY]: ['view'],
  [BOS_MODULES.EXPERTS]: ['view'],
  [BOS_MODULES.COMPOSITIONS]: ['view'],
  [BOS_MODULES.MEETINGS]: ['view'],
  [BOS_MODULES.TA_DA]: ['view'],
  [BOS_MODULES.REPORTS]: ['view'],
  [BOS_MODULES.COURSES]: ['view'],
  [BOS_MODULES.SCHEME]: ['view'],
},

// AFTER
default: {
  // BOS module is not open to default roles.
  // Only faculty, hod, principal, and super_admin have access.
  // Other roles require explicit custom_role assignment via user_roles table.
},
```

**Change 2:** Remove coordinator entry (or empty it)

```typescript
// BEFORE (lines 95-106)
// Delete this entire block:
coordinator: { ... },

// OR (if coordinator needs non-BOS access):
coordinator: {
  // Keep only non-BOS permissions if any
},
```

### Option B: Explicit Denial (More defensive)

Create an explicit "no BOS access" marker and check before accessing any BOS page. This is more work but more explicit about the intent.

---

## Verification Checklist

- [ ] `DEFAULT_ROLE_PERMISSIONS.default` is empty or has NO BOS modules
- [ ] `DEFAULT_ROLE_PERMISSIONS.coordinator` is removed or emptied
- [ ] `getRolePermissions('student')` returns empty {} (or very minimal)
- [ ] `getRolePermissions('parent')` returns empty {}
- [ ] `getRolePermissions('staff')` returns empty {}
- [ ] `getRolePermissions('faculty')` still returns full BOS permissions
- [ ] `getRolePermissions('hod')` still returns full BOS permissions
- [ ] `getRolePermissions('principal')` still returns BOS permissions
- [ ] Super admin check in `usePermissions()` still returns bypass
- [ ] BosViewGuard still allows board members (membership + principal + super_admin)
- [ ] Student trying to access `/bos/syllabus` gets 403 (or fallback component)
- [ ] Staff trying to access `/bos/meetings` gets 403 (or fallback component)
- [ ] Faculty trying to access `/bos/courses` succeeds (if on board or has role perm)
- [ ] HOD trying to access `/bos/syllabus` succeeds
- [ ] Principal trying to access `/bos/compositions` succeeds
- [ ] Super Admin accessing anything succeeds

---

## Summary

| Role | Current | After Fix | Status |
|------|---------|-----------|--------|
| super_admin | ✅ Access | ✅ Access | ✓ No change |
| administrator | ✅ Access | ✅ Access | ✓ Covered by super_admin check |
| principal | ✅ Access | ✅ Access | ✓ No change |
| hod | ✅ Access | ✅ Access | ✓ No change |
| faculty | ✅ Access | ✅ Access | ✓ No change |
| coordinator | ✅ Access (not approved) | ❌ Access | ✓ **FIXED** |
| student | ✅ Access (not approved) | ❌ Access | ✓ **FIXED** |
| staff | ✅ Access (not approved) | ❌ Access | ✓ **FIXED** |
| parent | ✅ Access (not approved) | ❌ Access | ✓ **FIXED** |
| guest | ✅ Access (not approved) | ❌ Access | ✓ **FIXED** |
| driver | ✅ Access (not approved) | ❌ Access | ✓ **FIXED** |
| nif_coordinator | ✅ Access (not approved) | ❌ Access | ✓ **FIXED** |
