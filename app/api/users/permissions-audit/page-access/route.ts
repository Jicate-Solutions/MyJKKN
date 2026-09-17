export const dynamic = 'force-dynamic';

/**
 * Page Access Lens — "which roles can open this screen, and what can they do on it".
 *
 * Joins the build-time static map (lib/permissions-audit/page-access-map.generated.ts,
 * which knows what the CODE gates each surface on) against live
 * `custom_roles.permissions` (which knows who holds what). Neither half can
 * answer the question alone, and keeping them apart is what stops the answer
 * going stale: editing a role in Role Management changes this response with no
 * redeploy, while moving a permission gate in a .tsx file changes the committed
 * map in a reviewable diff.
 *
 * THE RULES ARE IMPORTED, NOT REIMPLEMENTED
 *   Page access runs through `isPageAccessible()` — the exact function the
 *   sidebar and <RoutePermissionGuard> call. Reimplementing it here would mean
 *   this audit screen could report access the app does not actually grant,
 *   which is the one bug an audit screen must not have. Every sentinel refusal,
 *   the is_admin() bypass, and the named carve-outs (MBA analytics, case
 *   studies, School of Influence roster) therefore apply for free.
 *
 *   Control access mirrors `usePermissions().canAccess`, which bypasses ONLY
 *   super admins and otherwise reads the merged permission map — so admins do
 *   NOT get a blanket pass on buttons the way they do on routes. That asymmetry
 *   is real, and flattening it would over-report.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';

import { isPageAccessible } from '@/lib/navigation/permission-filter';
import { getDisplayNameForModuleKey } from '@/lib/permissions-audit/module-mappings';
import { getNonKeyGate } from '@/lib/permissions-audit/non-key-gates';
import { PAGE_ACCESS_MAP } from '@/lib/permissions-audit/page-access-map.generated';
import { resolvePageGate } from '@/lib/permissions-audit/page-gate';
import {
  getPermissionValue,
  getRoleUserCounts
} from '@/lib/permissions-audit/role-user-counts';
import type {
  NonKeyGate,
  PageAccessResponse,
  ResolvedPageAccess,
  ResolvedPageAction,
  ResolvedPageTab,
  ResolvedRole
} from '@/types/permissions-audit';

const SUPER_ADMIN_KEY = 'super_admin';

interface RoleRow {
  role_key: string;
  role_name: string;
  permissions: Record<string, unknown> | null;
  is_system_role: boolean | null;
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Same gate as /unified — it reads is_super_admin as well as the legacy
    // role string, and this endpoint exposes the whole permission surface of
    // every module, so it takes the stricter of the two checks in this folder.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (
      profileError ||
      (profile?.is_super_admin !== true && profile?.role !== SUPER_ADMIN_KEY)
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const moduleKey = new URL(request.url).searchParams.get('module');
    if (!moduleKey) {
      return NextResponse.json(
        { error: 'Missing required query parameter: module' },
        { status: 400 }
      );
    }

    const { data: roleRows, error: rolesError } = await supabase
      .from('custom_roles')
      .select('role_key, role_name, permissions, is_system_role')
      .order('role_name');

    if (rolesError) {
      console.error('[permissions-audit/page-access] roles fetch failed:', rolesError);
      return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
    }

    const roles = (roleRows ?? []) as RoleRow[];
    const counts = await getRoleUserCounts(
      supabase,
      new Set(roles.map((r) => r.role_key))
    );

    const roleMeta: PageAccessResponse['roleMeta'] = {};
    for (const r of roles) {
      roleMeta[r.role_key] = {
        name: r.role_name,
        userCount: counts[r.role_key] ?? 0,
        isSystem: r.is_system_role ?? false
      };
    }

    const superAdmin = roles.find((r) => r.role_key === SUPER_ADMIN_KEY);

    /**
     * Super admins bypass every per-permission flag via is_super_admin(), so
     * they lead every list regardless of what their own JSONB contains. Without
     * synthesising them the tab showed them on some rows and not others,
     * depending purely on whether that key happened to be stored.
     */
    const superAdminEntry = (): ResolvedRole[] =>
      superAdmin
        ? [
            {
              roleKey: SUPER_ADMIN_KEY,
              roleName: superAdmin.role_name,
              userCount: counts[SUPER_ADMIN_KEY] ?? 0,
              alwaysGrants: true
            }
          ]
        : [];

    const byUserCount = (a: ResolvedRole, b: ResolvedRole) =>
      b.userCount - a.userCount || a.roleName.localeCompare(b.roleName);

    const asRole = (r: RoleRow, derived = false): ResolvedRole => ({
      roleKey: r.role_key,
      roleName: r.role_name,
      userCount: counts[r.role_key] ?? 0,
      ...(derived ? { derived: true } : {})
    });

    /** Roles that may OPEN a URL — the sidebar/route-guard rule, per role. */
    const rolesForPage = (url: string, permission: string | null): ResolvedRole[] => {
      const rest: ResolvedRole[] = [];
      for (const r of roles) {
        if (r.role_key === SUPER_ADMIN_KEY) continue;
        const granted = isPageAccessible(
          url,
          permission ?? undefined,
          (r.permissions ?? {}) as Record<string, boolean>,
          false, // isSuperAdmin — handled separately as a synthetic entry
          r.role_key // drives hasDbAdminBypass, mirroring the DB is_admin()
        );
        if (granted) rest.push(asRole(r));
      }
      return [...superAdminEntry(), ...rest.sort(byUserCount)];
    };

    /** Roles that hold one permission key — the canAccess() rule, per role. */
    const rolesForKey = (key: string, derived = false): ResolvedRole[] => {
      const rest: ResolvedRole[] = [];
      for (const r of roles) {
        if (r.role_key === SUPER_ADMIN_KEY) continue;
        if (getPermissionValue(r.permissions, key)) rest.push(asRole(r, derived));
      }
      return [...superAdminEntry(), ...rest.sort(byUserCount)];
    };

    const guardedPrefixes = PAGE_ACCESS_MAP.guardedPrefixes;
    const pages: ResolvedPageAccess[] = [];

    for (const page of PAGE_ACCESS_MAP.pages) {
      if (page.moduleKey !== moduleKey) continue;

      const pageRoles = rolesForPage(page.url, page.gate.permission);

      const tabs: ResolvedPageTab[] = page.tabs.map((tab) => {
        const nonKeyGate = tab.gateHook ? describeGate(tab.gateHook) : null;

        if (tab.kind === 'in-page') {
          // A Radix tab has no route and, unless it carries its own gate hook,
          // nothing narrows it: whoever can open the page sees it. Saying so
          // explicitly is the point — implying a gate that isn't there would
          // make the lens lie in the safe-looking direction.
          return {
            label: tab.label,
            kind: 'in-page',
            value: tab.value,
            gate: null,
            nonKeyGate,
            roles: nonKeyGate?.mirrors
              ? narrow(pageRoles, rolesForKey(nonKeyGate.mirrors, true))
              : pageRoles,
            inheritsPageAccess: !nonKeyGate
          };
        }

        const href = tab.href!;
        const gate = resolvePageGate(href, guardedPrefixes);
        const routeRoles = rolesForPage(href, gate.permission);

        // A gated tab needs BOTH: the route's own permission AND whatever the
        // hook asks. Intersecting is the honest composition — reporting either
        // one alone over-reports.
        const resolved = nonKeyGate?.mirrors
          ? narrow(routeRoles, rolesForKey(nonKeyGate.mirrors, true))
          : routeRoles;

        return {
          label: tab.label,
          kind: 'route',
          href,
          gate,
          nonKeyGate,
          roles: resolved,
          // The tab is a no-op gate only when its route resolves to the same
          // permission as the page and nothing else narrows it.
          inheritsPageAccess:
            !nonKeyGate && gate.permission === page.gate.permission
        };
      });

      const actions: ResolvedPageAction[] = page.actions.map((action) => ({
        ...action,
        roles: rolesForKey(action.permissionKey)
      }));

      pages.push({
        url: page.url,
        label: page.label,
        moduleKey: page.moduleKey,
        gate: page.gate,
        unresolvedGates: page.unresolvedGates,
        roles: pageRoles,
        totalUsers: pageRoles.reduce((n, r) => n + r.userCount, 0),
        tabs,
        actions,
        nonKeyGates: page.gateHooks.map(describeGate)
      });
    }

    // Most-reachable first: the widely-open pages are where an over-grant costs
    // the most, so they should not be buried under single-role admin screens.
    pages.sort(
      (a, b) => b.roles.length - a.roles.length || a.url.localeCompare(b.url)
    );

    const response: PageAccessResponse = {
      moduleKey,
      moduleLabel: getDisplayNameForModuleKey(moduleKey),
      pages,
      roleMeta,
      generatedAt: PAGE_ACCESS_MAP.generatedAt,
      computedAt: new Date().toISOString()
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[permissions-audit/page-access] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Join a stored gate-hook reference against the curated meaning. */
function describeGate(ref: { hook: string; file: string }): NonKeyGate {
  const def = getNonKeyGate(ref.hook);
  return {
    hook: ref.hook,
    file: ref.file,
    mirrors: def?.mirrors ?? null,
    note:
      def?.note ??
      'This gate is not documented in lib/permissions-audit/non-key-gates.ts, ' +
        'so the roles it admits cannot be determined from code. Read the hook to find out.'
  };
}

/**
 * Intersect two resolved-role lists, keeping the first list's order and
 * carrying the `derived` marker across so the UI can say the answer came from
 * a mirrored key rather than from the gate itself.
 */
function narrow(base: ResolvedRole[], filter: ResolvedRole[]): ResolvedRole[] {
  const allowed = new Map(filter.map((r) => [r.roleKey, r]));
  return base
    .filter((r) => r.alwaysGrants || allowed.has(r.roleKey))
    .map((r) =>
      r.alwaysGrants ? r : { ...r, derived: allowed.get(r.roleKey)?.derived ?? true }
    );
}
