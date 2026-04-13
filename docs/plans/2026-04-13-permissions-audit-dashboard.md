# Permissions Audit Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build a super-admin-only dashboard at `/users/permissions-audit` that makes the entire role/permission system visible — orphan users, role mismatches, effective permissions, and side-by-side comparisons.

**Architecture:** 4-tab client page (System Health, User Resolver, Permission Matrix, Comparison) backed by 4 read-only API endpoints that query existing tables directly. No new DB tables, no new services.

**Tech Stack:** Next.js 15 App Router, shadcn/ui (Tabs, Card, Table, Badge, Command, Accordion), React Query, Tailwind CSS, Supabase SSR client.

**Spec:** `docs/SPEC-permissions-audit-dashboard.md`

---

## Phase 1: Foundation (API + Sidebar)

### Task 1: Add sidebar menu entry and permission constant

**Files:**
- Modify: `lib/sidebarMenuLink.ts`
- Modify: `lib/constants/permissions.ts`

**Step 1: Add permission mapping**

In `lib/sidebarMenuLink.ts`, find the MENU_PERMISSIONS object. After the line:
```typescript
'/users/role-management': 'roles.create',
```
Add:
```typescript
'/users/permissions-audit': 'users.permissions_audit.view',
```

**Step 2: Add sidebar menu item**

In the `GetPages()` function, find the 'User Management' group. After the Activity Audit Logs entry (the one with `ClipboardCheck` icon), add:
```typescript
{
  href: '/users/permissions-audit',
  label: 'Permissions Audit',
  active: pathname === '/users/permissions-audit',
  icon: ShieldCheck,
  submenus: []
},
```

**Step 3: Add ShieldCheck import**

At the top of `lib/sidebarMenuLink.ts`, find the lucide-react imports and add `ShieldCheck` to the import list.

**Step 4: Add permission category**

In `lib/constants/permissions.ts`, find the `PERMISSION_CATEGORIES` array. In the 'User Management' category object (`key: 'users'`), add to the permissions array:
```typescript
{ key: 'users.permissions_audit.view', label: 'View Permissions Audit Dashboard' },
```

**Step 5: Verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds (no import errors)

---

### Task 2: Health API endpoint

**Files:**
- Create: `app/api/users/permissions-audit/health/route.ts`

**Step 1: Create the API route**

```typescript
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';

export async function GET() {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); }
        }
      }
    );

    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!profile || (!profile.is_super_admin && profile.role !== 'super_admin' && profile.role !== 'administrator')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Total users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // 2. Orphan count (profiles with no user_roles entry)
    const { data: orphanData } = await supabase.rpc('exec_sql', {
      query: `
        SELECT p.role, COUNT(*) as count
        FROM profiles p
        LEFT JOIN user_roles ur ON ur.user_id = p.id
        WHERE ur.id IS NULL
        GROUP BY p.role
        ORDER BY count DESC
      `
    });

    // Fallback: if RPC not available, use two queries
    let orphansByRole: { role: string; count: number }[] = [];
    let totalOrphans = 0;

    if (orphanData) {
      orphansByRole = orphanData;
      totalOrphans = orphanData.reduce((sum: number, r: any) => sum + parseInt(r.count), 0);
    } else {
      // Manual approach: get all user IDs that have roles
      const { data: usersWithRoles } = await supabase
        .from('user_roles')
        .select('user_id');
      const userIdsWithRoles = new Set((usersWithRoles || []).map((u: any) => u.user_id));

      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, role');

      const orphanMap: Record<string, number> = {};
      (allProfiles || []).forEach((p: any) => {
        if (!userIdsWithRoles.has(p.id)) {
          orphanMap[p.role] = (orphanMap[p.role] || 0) + 1;
          totalOrphans++;
        }
      });
      orphansByRole = Object.entries(orphanMap).map(([role, count]) => ({ role, count }));
    }

    // 3. Role mismatch count
    const { data: userRolesData } = await supabase
      .from('user_roles')
      .select('user_id, role_id, is_primary, custom_roles!inner(role_key)')
      .eq('is_primary', true);

    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, role');

    const profileRoleMap = new Map((profilesData || []).map((p: any) => [p.id, p.role]));
    let mismatchCount = 0;
    (userRolesData || []).forEach((ur: any) => {
      const profileRole = profileRoleMap.get(ur.user_id);
      const urRoleKey = (ur.custom_roles as any)?.role_key;
      if (profileRole && urRoleKey && profileRole !== urRoleKey) {
        mismatchCount++;
      }
    });

    // 4. Roles count
    const { data: roles, count: totalRoles } = await supabase
      .from('custom_roles')
      .select('*', { count: 'exact' });

    // 5. Super admin list
    const { data: superAdmins } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_super_admin, is_active, last_login')
      .or('is_super_admin.eq.true,role.eq.super_admin');

    // Check which super admins have user_roles entries
    const superAdminIds = (superAdmins || []).map((sa: any) => sa.id);
    const { data: saRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('user_id', superAdminIds);
    const saWithRoles = new Set((saRoles || []).map((r: any) => r.user_id));

    const superAdminList = (superAdmins || []).map((sa: any) => ({
      ...sa,
      hasUserRolesEntry: saWithRoles.has(sa.id)
    }));

    // 6. Users per role
    const roleCounts: Record<string, { profileCount: number; userRolesCount: number; roleName: string }> = {};
    (roles || []).forEach((r: any) => {
      roleCounts[r.role_key] = { profileCount: 0, userRolesCount: 0, roleName: r.role_name };
    });

    (profilesData || []).forEach((p: any) => {
      if (roleCounts[p.role]) {
        roleCounts[p.role].profileCount++;
      }
    });

    (userRolesData || []).forEach((ur: any) => {
      const key = (ur.custom_roles as any)?.role_key;
      if (key && roleCounts[key]) {
        roleCounts[key].userRolesCount++;
      }
    });

    // Need ALL user_roles for accurate count (not just primary)
    const { data: allUserRoles } = await supabase
      .from('user_roles')
      .select('role_id, custom_roles!inner(role_key)');

    const urCountMap: Record<string, number> = {};
    (allUserRoles || []).forEach((ur: any) => {
      const key = (ur.custom_roles as any)?.role_key;
      if (key) urCountMap[key] = (urCountMap[key] || 0) + 1;
    });

    const usersPerRole = Object.entries(roleCounts).map(([roleKey, data]) => ({
      roleKey,
      roleName: data.roleName,
      profileCount: data.profileCount,
      userRolesCount: urCountMap[roleKey] || 0,
      delta: data.profileCount - (urCountMap[roleKey] || 0)
    })).sort((a, b) => b.profileCount - a.profileCount);

    // 7. Permission health by role
    const permissionHealth = (roles || []).map((r: any) => {
      const perms = r.permissions || {};
      const keys = Object.keys(perms);
      const granted = keys.filter(k => perms[k] === true || perms[k] === 'true').length;
      return {
        roleKey: r.role_key,
        roleName: r.role_name,
        isSystemRole: r.is_system_role,
        totalDefined: keys.length,
        granted,
        grantedPercent: keys.length > 0 ? Math.round((granted / keys.length) * 100) : 0,
        flagged: keys.length > 10 && (granted / keys.length) < 0.1
      };
    }).sort((a, b) => b.granted - a.granted);

    return NextResponse.json({
      totals: {
        users: totalUsers || 0,
        orphans: totalOrphans,
        mismatches: mismatchCount,
        roles: totalRoles || 0,
        superAdmins: (superAdmins || []).length
      },
      orphansByRole,
      usersPerRole,
      permissionHealth,
      superAdminList
    });
  } catch (error) {
    console.error('[permissions-audit/health] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Verify**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds

---

### Task 3: Resolve API endpoint

**Files:**
- Create: `app/api/users/permissions-audit/resolve/route.ts`

**Step 1: Create the resolve endpoint**

```typescript
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); }
        }
      }
    );

    // Auth check
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (!callerProfile || (!callerProfile.is_super_admin && callerProfile.role !== 'super_admin' && callerProfile.role !== 'administrator')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get target user ID
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId parameter required' }, { status: 400 });
    }

    // Fetch profile
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, is_super_admin, is_active, last_login, avatar_url, institution_id')
      .eq('id', userId)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Institution scoping for administrators
    if (callerProfile.role === 'administrator' && !callerProfile.is_super_admin) {
      if (targetProfile.institution_id !== callerProfile.institution_id) {
        return NextResponse.json({ error: 'Cannot view users from other institutions' }, { status: 403 });
      }
    }

    // Fetch user_roles with role details
    const { data: assignedRoles } = await supabase
      .from('user_roles')
      .select('id, role_id, is_primary, assigned_at, assigned_by, custom_roles!inner(role_key, role_name, permissions)')
      .eq('user_id', userId)
      .order('is_primary', { ascending: false });

    const isOrphan = !assignedRoles || assignedRoles.length === 0;

    // Determine primary role from user_roles
    const primaryRoleEntry = (assignedRoles || []).find((r: any) => r.is_primary);
    const primaryRoleKey = primaryRoleEntry ? (primaryRoleEntry.custom_roles as any)?.role_key : null;
    const isMismatch = primaryRoleKey !== null && targetProfile.role !== primaryRoleKey;

    // Merge permissions (union/OR logic)
    const mergedPermissions: Record<string, boolean> = {};
    const permissionSources: Record<string, string[]> = {};

    if (isOrphan) {
      // Fallback: look up legacy role permissions from custom_roles
      const { data: legacyRole } = await supabase
        .from('custom_roles')
        .select('permissions')
        .eq('role_key', targetProfile.role)
        .single();

      if (legacyRole?.permissions) {
        Object.entries(legacyRole.permissions).forEach(([key, value]) => {
          if (value === true || value === 'true') {
            mergedPermissions[key] = true;
            permissionSources[key] = [targetProfile.role + ' (legacy)'];
          }
        });
      }
    } else {
      (assignedRoles || []).forEach((ur: any) => {
        const rolePerms = (ur.custom_roles as any)?.permissions || {};
        const roleKey = (ur.custom_roles as any)?.role_key || 'unknown';
        Object.entries(rolePerms).forEach(([key, value]) => {
          if (value === true || value === 'true') {
            mergedPermissions[key] = true;
            if (!permissionSources[key]) permissionSources[key] = [];
            permissionSources[key].push(roleKey);
          }
        });
      });
    }

    // Super admin override
    const isSuperAdmin = targetProfile.is_super_admin || targetProfile.role === 'super_admin';

    // Fetch institution access
    const { data: institutionAccess } = await supabase
      .from('user_institution_access')
      .select('id, institution_id, access_type, is_active, granted_by, granted_at, institutions!inner(name)')
      .eq('user_id', userId);

    // Format assigned roles
    const formattedRoles = (assignedRoles || []).map((r: any) => ({
      roleKey: (r.custom_roles as any)?.role_key,
      roleName: (r.custom_roles as any)?.role_name,
      isPrimary: r.is_primary,
      assignedAt: r.assigned_at,
      assignedBy: r.assigned_by
    }));

    // Format institution access
    const formattedAccess = (institutionAccess || []).map((ia: any) => ({
      institutionId: ia.institution_id,
      institutionName: (ia.institutions as any)?.name,
      accessType: ia.access_type,
      isActive: ia.is_active,
      grantedAt: ia.granted_at
    }));

    return NextResponse.json({
      user: {
        id: targetProfile.id,
        email: targetProfile.email,
        fullName: targetProfile.full_name,
        avatarUrl: targetProfile.avatar_url,
        role: targetProfile.role,
        isSuperAdmin,
        isActive: targetProfile.is_active,
        lastLogin: targetProfile.last_login,
        institutionId: targetProfile.institution_id
      },
      isOrphan,
      legacyRole: targetProfile.role,
      assignedRoles: formattedRoles,
      primaryRole: primaryRoleKey,
      isMismatch,
      isSuperAdmin,
      mergedPermissions,
      permissionSources,
      institutionAccess: formattedAccess
    });
  } catch (error) {
    console.error('[permissions-audit/resolve] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

### Task 4: Matrix API endpoint

**Files:**
- Create: `app/api/users/permissions-audit/matrix/route.ts`

**Step 1: Create the matrix endpoint**

```typescript
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';

export async function GET() {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); }
        }
      }
    );

    // Auth check (super admin only)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile || (!profile.is_super_admin && profile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden - Super Admin only' }, { status: 403 });
    }

    // Fetch all roles
    const { data: roles } = await supabase
      .from('custom_roles')
      .select('role_key, role_name, permissions, is_system_role');

    // Count users per role
    const { data: allUserRoles } = await supabase
      .from('user_roles')
      .select('role_id, custom_roles!inner(role_key)');

    const userCountMap: Record<string, number> = {};
    (allUserRoles || []).forEach((ur: any) => {
      const key = (ur.custom_roles as any)?.role_key;
      if (key) userCountMap[key] = (userCountMap[key] || 0) + 1;
    });

    // Build role metadata
    const roleKeys = (roles || []).map((r: any) => r.role_key);
    const roleMeta: Record<string, { name: string; userCount: number; isSystem: boolean }> = {};
    (roles || []).forEach((r: any) => {
      roleMeta[r.role_key] = {
        name: r.role_name,
        userCount: userCountMap[r.role_key] || 0,
        isSystem: r.is_system_role
      };
    });

    // Build permission matrix
    const allPermKeys = new Set<string>();
    (roles || []).forEach((r: any) => {
      Object.keys(r.permissions || {}).forEach(k => allPermKeys.add(k));
    });

    const matrix: Record<string, Record<string, boolean>> = {};
    allPermKeys.forEach(permKey => {
      matrix[permKey] = {};
      (roles || []).forEach((r: any) => {
        const val = r.permissions?.[permKey];
        matrix[permKey][r.role_key] = val === true || val === 'true';
      });
    });

    return NextResponse.json({
      roles: roleKeys,
      roleMeta,
      matrix
    });
  } catch (error) {
    console.error('[permissions-audit/matrix] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

### Task 5: Compare API endpoint

**Files:**
- Create: `app/api/users/permissions-audit/compare/route.ts`

**Step 1: Create the compare endpoint**

```typescript
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); }
        }
      }
    );

    // Auth check (super admin only)
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile || (!profile.is_super_admin && profile.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type'); // 'users' or 'roles'
    const left = url.searchParams.get('left');
    const right = url.searchParams.get('right');

    if (!type || !left || !right) {
      return NextResponse.json({ error: 'type, left, and right params required' }, { status: 400 });
    }

    if (type === 'roles') {
      // Compare two roles
      const { data: leftRole } = await supabase
        .from('custom_roles')
        .select('role_key, role_name, permissions')
        .eq('role_key', left)
        .single();

      const { data: rightRole } = await supabase
        .from('custom_roles')
        .select('role_key, role_name, permissions')
        .eq('role_key', right)
        .single();

      if (!leftRole || !rightRole) {
        return NextResponse.json({ error: 'One or both roles not found' }, { status: 404 });
      }

      const leftPerms = leftRole.permissions || {};
      const rightPerms = rightRole.permissions || {};
      const allKeys = new Set([...Object.keys(leftPerms), ...Object.keys(rightPerms)]);

      const comparison: Record<string, { left: boolean; right: boolean; status: 'both' | 'left_only' | 'right_only' | 'neither' }> = {};
      allKeys.forEach(key => {
        const l = leftPerms[key] === true || leftPerms[key] === 'true';
        const r = rightPerms[key] === true || rightPerms[key] === 'true';
        let status: 'both' | 'left_only' | 'right_only' | 'neither';
        if (l && r) status = 'both';
        else if (l) status = 'left_only';
        else if (r) status = 'right_only';
        else status = 'neither';
        comparison[key] = { left: l, right: r, status };
      });

      // User counts
      const { data: leftUsers } = await supabase
        .from('user_roles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role_id', leftRole.role_key); // Need role ID, not key

      return NextResponse.json({
        type: 'roles',
        left: { roleKey: leftRole.role_key, roleName: leftRole.role_name },
        right: { roleKey: rightRole.role_key, roleName: rightRole.role_name },
        comparison
      });
    }

    // type === 'users' — handled by calling /resolve twice on the client side
    // This keeps the API simple
    return NextResponse.json({ error: 'For user comparison, call /resolve for each user separately' }, { status: 400 });
  } catch (error) {
    console.error('[permissions-audit/compare] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

### Task 6: User search API endpoint

**Files:**
- Create: `app/api/users/permissions-audit/search/route.ts`

**Step 1: Create search endpoint for the combobox**

```typescript
export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: any) { cookieStore.set(name, value, options); },
          remove(name: string, options: any) { cookieStore.set(name, '', { ...options, maxAge: 0 }); }
        }
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile || (!profile.is_super_admin && profile.role !== 'super_admin' && profile.role !== 'administrator')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const q = url.searchParams.get('q') || '';
    if (q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const { data: results } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, avatar_url')
      .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
      .order('full_name')
      .limit(10);

    return NextResponse.json({ results: results || [] });
  } catch (error) {
    console.error('[permissions-audit/search] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

**Step 2: Build check**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds with all 4 API routes + search

---

## Phase 2: UI — System Health Tab

### Task 7: Page shell and client wrapper

**Files:**
- Create: `app/(routes)/users/permissions-audit/page.tsx`
- Create: `app/(routes)/users/permissions-audit/_components/permissions-audit-client.tsx`

**Step 1: Create the server page**

```typescript
// app/(routes)/users/permissions-audit/page.tsx
import { PermissionsAuditClient } from './_components/permissions-audit-client';

export default function PermissionsAuditPage() {
  return <PermissionsAuditClient />;
}
```

**Step 2: Create the client wrapper with tabs**

```typescript
// app/(routes)/users/permissions-audit/_components/permissions-audit-client.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserService } from '@/lib/services/users/user-service';
import { SYSTEM_ROLES } from '@/types/auth';
import { BeatLoader } from 'react-spinners';
import { ShieldCheck } from 'lucide-react';
import { SystemHealthTab } from './system-health-tab';
import { UserResolverTab } from './user-resolver-tab';
import { PermissionMatrixTab } from './permission-matrix-tab';
import { ComparisonTab } from './comparison-tab';

export function PermissionsAuditClient() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: profile } = await UserService.getCurrentUserProfile();
        if (!profile || (profile.role !== SYSTEM_ROLES.SUPER_ADMIN && !profile.is_super_admin)) {
          router.push('/unauthorized');
          return;
        }
        setIsAuthorized(true);
      } catch {
        router.push('/unauthorized');
      } finally {
        setIsLoading(false);
      }
    };
    checkAccess();
  }, [router]);

  if (isLoading) {
    return (
      <ContentLayout title="Permissions Audit">
        <div className="flex items-center justify-center h-64">
          <BeatLoader color="#6366f1" size={12} />
        </div>
      </ContentLayout>
    );
  }

  if (!isAuthorized) return null;

  return (
    <ContentLayout title="Permissions Audit">
      <PageBreadcrumb
        items={[
          { label: 'Users', href: '/users' },
          { label: 'Permissions Audit' }
        ]}
      />
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Permissions Audit Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Inspect roles, permissions, and access across the entire system
            </p>
          </div>
        </div>

        <Tabs defaultValue="health" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="health">System Health</TabsTrigger>
            <TabsTrigger value="resolver">User Resolver</TabsTrigger>
            <TabsTrigger value="matrix">Permission Matrix</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
          </TabsList>

          <TabsContent value="health" className="mt-6">
            <SystemHealthTab />
          </TabsContent>

          <TabsContent value="resolver" className="mt-6">
            <UserResolverTab />
          </TabsContent>

          <TabsContent value="matrix" className="mt-6">
            <PermissionMatrixTab />
          </TabsContent>

          <TabsContent value="comparison" className="mt-6">
            <ComparisonTab />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
```

**Step 3: Create placeholder tabs** (each file just exports a component with "Coming soon")

Create these 4 stub files at `app/(routes)/users/permissions-audit/_components/`:
- `system-health-tab.tsx`
- `user-resolver-tab.tsx`
- `permission-matrix-tab.tsx`
- `comparison-tab.tsx`

Each follows this pattern:
```typescript
'use client';
export function SystemHealthTab() {
  return <div className="text-muted-foreground p-8 text-center">Loading...</div>;
}
```

**Step 4: Build check**

Run: `npx next build 2>&1 | tail -5`
Expected: Build succeeds, page accessible at /users/permissions-audit

---

### Task 8: System Health Tab — full implementation

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/system-health-tab.tsx`

**Step 1: Implement the System Health tab**

This component:
1. Fetches from `/api/users/permissions-audit/health`
2. Shows 4 stat cards (Total Users, Orphans, Mismatches, Roles)
3. Shows 3 tables (Users Per Role, Permission Health, Super Admin List)
4. Uses React Query for caching

Key UI elements:
- `Card` from shadcn for stat cards
- Standard HTML `<table>` with Tailwind for data tables
- `Badge` for warning/error indicators
- `AlertTriangle` icon for flagged items
- Color: red background for danger cards (orphans > 0), yellow for warnings

The stat cards use a 4-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`).

Each table has sorting by clicking column headers (use local state, no API re-fetch).

The full component code should follow the patterns from `/users/dashboard/page.tsx` but simpler (no charts, just cards + tables).

---

## Phase 3: UI — User Resolver Tab

### Task 9: User search combobox component

**Files:**
- Create: `app/(routes)/users/permissions-audit/_components/user-search-combobox.tsx`

Uses shadcn `Command` component (Combobox pattern) with debounced search. On input change:
1. Debounce 300ms
2. Fetch `/api/users/permissions-audit/search?q=...`
3. Show results as `CommandItem` with avatar + name + email + role badge
4. On select, call `onSelect(userId)` prop

---

### Task 10: User Resolver Tab — full implementation

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/user-resolver-tab.tsx`

This component:
1. Shows `UserSearchCombobox` at top
2. When user selected, fetches `/api/users/permissions-audit/resolve?userId=xxx`
3. Displays:
   - User info card (avatar, name, email, status, last login)
   - Role comparison section (legacy vs primary, mismatch badge, orphan warning)
   - Institution access table
   - Effective permissions accordion (grouped by `PERMISSION_CATEGORIES`)

Import `PERMISSION_CATEGORIES` from `@/lib/constants/permissions` to group permissions in the accordion.

Each accordion section shows: category name + granted count / total count. Inside: list of permissions with checkmark (granted) or X (denied). Tooltip on each permission shows which role(s) grant it (from `permissionSources`).

Add filter buttons: "All" | "Granted Only" | "Denied Only"

---

## Phase 4: UI — Matrix + Comparison Tabs

### Task 11: Permission Matrix Tab

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/permission-matrix-tab.tsx`

This component:
1. Fetches from `/api/users/permissions-audit/matrix`
2. Renders a horizontally scrollable table
3. Rows = permissions (grouped by PERMISSION_CATEGORIES)
4. Columns = roles (with role name + user count in header)
5. Cells = green dot for granted, empty for denied
6. Module filter dropdown (show only selected category)
7. Role filter (multi-select to show only selected roles)

Use `overflow-x-auto` with sticky first column for permission names.

---

### Task 12: Comparison Tab

**Files:**
- Modify: `app/(routes)/users/permissions-audit/_components/comparison-tab.tsx`

This component:
1. Mode toggle: "Compare Users" | "Compare Roles"
2. **Compare Roles mode:**
   - Two role dropdowns (populated from matrix API roleMeta)
   - Fetches `/api/users/permissions-audit/compare?type=roles&left=xxx&right=yyy`
   - Shows side-by-side permission list with color coding:
     - Green row = both have
     - Yellow row = only left
     - Blue row = only right
     - Gray row = neither
3. **Compare Users mode:**
   - Two `UserSearchCombobox` components
   - Calls `/resolve` for each user
   - Shows side-by-side:
     - Profile info
     - Roles
     - Permissions diff (same color coding)

---

## Phase 5: Polish + Verify

### Task 13: Build verification

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds with zero type errors in permissions-audit files

### Task 14: Browser test

1. Navigate to `/users/permissions-audit`
2. Verify System Health tab loads with real data
3. Click User Resolver tab, search for "director@jkkn.ac.in"
4. Verify super_admin shows with all permissions
5. Search for an orphan user (e.g., Isvarya) — verify warning badge
6. Click Permission Matrix tab — verify grid loads
7. Click Comparison tab — compare two roles (student vs faculty)
8. Test with non-super-admin account — verify redirect to /unauthorized

---

## Dependency Graph

```
Task 1 (sidebar + permissions)
    │
    ├── Task 2 (health API)
    ├── Task 3 (resolve API)
    ├── Task 4 (matrix API)
    ├── Task 5 (compare API)
    └── Task 6 (search API)
         │
         └── Task 7 (page shell + tabs)
              │
              ├── Task 8  (System Health tab)
              ├── Task 9  (search combobox)
              │    └── Task 10 (User Resolver tab)
              ├── Task 11 (Matrix tab)
              └── Task 12 (Comparison tab)
                   │
                   └── Task 13 (build verify)
                        └── Task 14 (browser test)
```

**Parallelizable:** Tasks 2-6 (all API routes) can be built in parallel. Tasks 8, 10, 11, 12 (tab implementations) can be built in parallel after Task 7.

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Health API too slow (5,600 profiles + 5,400 user_roles) | Use `select('*', { count: 'exact', head: true })` for counts. Avoid fetching full rows when only counting. |
| Permission matrix too wide (19 columns) | Horizontal scroll with sticky first column. Role filter to hide unneeded columns. |
| Supabase SSR cookie handling varies across Next.js versions | Copy exact pattern from existing `dashboard-stats/route.ts` which is known working. |
| 400+ permission keys in accordion overwhelms the UI | Group by PERMISSION_CATEGORIES. Default "Granted Only" filter. Collapse all by default. |
| user_roles join to custom_roles via `!inner` may fail if role deleted | Use left join pattern, handle null custom_roles gracefully. |
