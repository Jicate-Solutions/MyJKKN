export const dynamic = 'force-dynamic';

// POST /api/users/roles/assign — assign a role to a user AND notify them immediately.
//
// Why this is a server route (not a client-side UserRolesService.addRole call):
// the user_roles INSERT RLS policy checks profiles.role IN ('super_admin','admin'),
// while the permissions-audit page/search gates admit 'administrator'. A browser
// insert could pass the UI gate yet be RLS-blocked. Doing the write here with the
// service-role client behind an explicit roles.assign check gives one audited path
// and sidesteps that admin/administrator spelling mismatch.
//
// Grant model: MyJKKN access is role-based — this assigns the WHOLE role (additive,
// leaves the user's primary role untouched; multi-role permissions merge via
// user_has_permission, so the grant is effective immediately).

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { recordFeatureUse, FEATURE_KEYS } from '@/lib/usage/record';
import { isPushOptedOut } from '@/lib/push/opt-out';
import webpush from 'web-push';

// Configure web-push with VAPID keys once on module load (same as notifications/send).
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@myjkkn.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const ADMIN_ROLE_KEYS = ['super_admin', 'administrator', 'admin'];

type RoleRow = {
  role_key?: string | null;
  is_privileged?: boolean | null;
};

function checkFailed(error: unknown) {
  console.error('[roles/assign] check failed:', error);
  return NextResponse.json(
    { error: 'Could not check this request. Nothing was changed.' },
    { status: 500 }
  );
}

/**
 * The same answer as user_has_permission's `(permissions->>key)::boolean`:
 * PostgreSQL's boolean input (t, true, y, yes, on, 1 and unambiguous
 * prefixes, any case, spaces trimmed). A value that would not cast is false.
 */
function grantsKey(permissions: unknown, key: string): boolean {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) return false;
  const v = (permissions as Record<string, unknown>)[key];
  if (v === true) return true;
  if (typeof v !== 'string' && typeof v !== 'number') return false;
  const t = String(v).trim().toLowerCase();
  return ['t', 'tr', 'tru', 'true', 'y', 'ye', 'yes', 'on', '1'].includes(t);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      userId?: string;
      roleKey?: string;
    };
    const userId = body.userId;
    const roleKey = body.roleKey;
    if (!userId || !roleKey) {
      return NextResponse.json(
        { error: 'userId and roleKey are required' },
        { status: 400 }
      );
    }

    // ── Gate: roles.assign on the caller's PRIMARY role + super-admin flag ──
    // Kept primary-role only on purpose (2026-10-08). Widening to every role
    // the caller holds (user_has_permission) would let the 27 guest holders
    // through if this code went live before migration 20271008121730 takes
    // roles.assign off guest. Widen it once that migration is applied.
    //
    // #4254 edits these same lines. Whichever PR merges second keeps BOTH rule
    // sets: #4254's callerIsSuperAdmin + refuseRoleChange, and this PR's
    // refusals below + 500 when any check cannot run.
    const { data: callerProfile, error: callerErr } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single();
    const superResult = await supabase.rpc('is_super_admin');
    if (callerErr || superResult.error) {
      return checkFailed(callerErr || superResult.error);
    }
    // Super admin = the is_super_admin flag, nothing else.
    const callerIsSuperAdmin = superResult.data === true;

    let allowed = callerIsSuperAdmin;
    if (!allowed && callerProfile?.role) {
      const { data: callerRole, error: callerRoleErr } = await supabase
        .from('custom_roles')
        .select('permissions')
        .eq('role_key', callerProfile.role)
        .maybeSingle();
      if (callerRoleErr) return checkFailed(callerRoleErr);
      allowed = grantsKey(callerRole?.permissions, 'roles.assign');
    }
    if (!allowed) {
      return NextResponse.json(
        { error: 'You do not have permission to assign roles (roles.assign required).' },
        { status: 403 }
      );
    }

    // (a) Nobody assigns a role to themselves, super admins included.
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot change your own roles; ask a super admin.' },
        { status: 403 }
      );
    }

    // ── Service-role client for the writes (bypasses the user_roles INSERT RLS mismatch) ──
    const admin = createServiceRoleClient();

    // Resolve role_key → role_id (the UI chips only carry role_key).
    const { data: role, error: roleErr } = await admin
      .from('custom_roles')
      .select('id, role_key, role_name')
      .eq('role_key', roleKey)
      .maybeSingle();
    if (roleErr) return checkFailed(roleErr);
    if (!role) {
      return NextResponse.json({ error: `Role '${roleKey}' not found` }, { status: 404 });
    }

    // (c) No escalation. The insert below uses the service-role client, which
    // skips every database guard. Anyone but a super admin may give only a
    // role that is not privileged, not every-college, and grants nothing the
    // caller does not hold (fn_caller_can_grant_role, asked as the caller).
    if (!callerIsSuperAdmin) {
      const { data: canGrant, error: grantErr } = await supabase.rpc('fn_caller_can_grant_role', {
        p_role_id: (role as { id: string }).id
      });
      if (grantErr) return checkFailed(grantErr);
      if (canGrant !== true) {
        return NextResponse.json(
          {
            error:
              'You can give only a role whose access you already hold yourself, that is not an admin role and does not reach every college.'
          },
          { status: 403 }
        );
      }
    }
    const roleId = (role as { id: string }).id;
    const roleName = (role as { role_name?: string }).role_name || roleKey;

    // Confirm the target user exists.
    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('id, full_name, email, role, is_super_admin')
      .eq('id', userId)
      .maybeSingle();
    if (targetErr) return checkFailed(targetErr);
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // (b) Only a super admin changes the roles of someone with admin powers
    // (Director, 1 Oct): a super admin flag, a legacy admin role, or any role
    // held that is privileged.
    const { data: targetRoles, error: targetRolesErr } = await admin
      .from('user_roles')
      .select('custom_roles(role_key, is_privileged)')
      .eq('user_id', userId);
    if (targetRolesErr) return checkFailed(targetRolesErr);
    const t = target as { role?: string | null; is_super_admin?: boolean | null };
    const targetHasAdminPowers =
      t.is_super_admin === true ||
      ADMIN_ROLE_KEYS.includes(t.role ?? '') ||
      ((targetRoles ?? []) as { custom_roles: RoleRow | RoleRow[] | null }[]).some((ur) =>
        (Array.isArray(ur.custom_roles) ? ur.custom_roles : [ur.custom_roles]).some(
          (r) => r != null && (r.is_privileged !== false || ADMIN_ROLE_KEYS.includes(r.role_key ?? ''))
        )
      );
    if (!callerIsSuperAdmin && targetHasAdminPowers) {
      return NextResponse.json(
        { error: 'This person has admin powers. Only a super admin can change their roles.' },
        { status: 403 }
      );
    }
    const targetName = (target as { full_name?: string }).full_name || 'The user';

    // ── Assign (additive) ──
    const { error: insErr } = await admin.from('user_roles').insert({
      user_id: userId,
      role_id: roleId,
      is_primary: false,
      assigned_by: user.id
    });
    if (insErr) {
      // Unique (user_id, role_id) violation → already has this role.
      if ((insErr as { code?: string }).code === '23505') {
        return NextResponse.json(
          {
            ok: false,
            alreadyAssigned: true,
            message: `${targetName} already has the ${roleName} role.`
          },
          { status: 409 }
        );
      }
      console.error('[roles/assign] user_roles insert error:', insErr);
      return NextResponse.json({ error: 'Failed to assign role' }, { status: 500 });
    }

    // ── Notify (in-app bell) — best-effort; the role is already assigned ──
    const callerName =
      (callerProfile as { full_name?: string })?.full_name || 'An administrator';
    const title = `New role assigned: ${roleName}`;
    const notifBody = `${callerName} assigned you the ${roleName} role. You now have ${roleName} access across MyJKKN.`;
    const url = '/notifications';

    let notificationId: string | null = null;
    try {
      const { data: notif } = await admin
        .from('notifications')
        .insert({
          title,
          body: notifBody,
          url,
          category: 'general',
          priority: 'normal',
          created_by: user.id,
          // targeting is NOT NULL with no default — without it this insert
          // throws and the in-app bell notification is silently dropped.
          targeting: { type: 'user', user_ids: [userId] }
        })
        .select('id')
        .single();
      notificationId = (notif as { id?: string } | null)?.id ?? null;
      if (notificationId) {
        await admin
          .from('user_notifications')
          .insert({ user_id: userId, notification_id: notificationId });
      }
    } catch (e) {
      console.error('[roles/assign] in-app notify failed (role still assigned):', e);
    }

    // ── Notify (web push to the ONE user) — best-effort ──
    let pushed = 0;
    try {
      if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
        // Check the person's own preference before looking up any subscription.
        // is_active alone cannot carry that answer: unsubscribing destroys the
        // browser endpoint, so the next page load mints a NEW row that is
        // is_active=true and passes the filter below perfectly.
        const optedOut = await isPushOptedOut(admin, userId);
        const subsResult = optedOut
          ? null
          : await admin
              .from('push_subscriptions')
              .select('id, subscription')
              .eq('user_id', userId)
              .eq('is_active', true);
        const subs = subsResult?.data;
        if (subs && subs.length) {
          const payload = JSON.stringify({
            title,
            body: notifBody,
            icon: '/icons/icon-192x192.png',
            url,
            data: { notification_id: notificationId, priority: 'normal' }
          });
          const results = await Promise.allSettled(
            subs.map(async (s: { id: string; subscription: unknown }) => {
              try {
                // web-push accepts the stored PushSubscription JSON as-is; typed
                // loosely here to match app/api/notifications/send/route.ts.
                await webpush.sendNotification(s.subscription as never, payload);
              } catch (err) {
                const code = (err as { statusCode?: number })?.statusCode;
                if (code === 410 || code === 404) {
                  await admin.from('push_subscriptions').delete().eq('id', s.id);
                }
                throw err;
              }
            })
          );
          pushed = results.filter((r) => r.status === 'fulfilled').length;
        }
      }
    } catch (e) {
      console.error('[roles/assign] web push failed (role still assigned):', e);
    }

    // Adoption loop: a role was saved onto someone's account.
    await recordFeatureUse(supabase, FEATURE_KEYS.USERS_ASSIGN_ROLE);

    return NextResponse.json({
      ok: true,
      roleName,
      user: { id: (target as { id: string }).id, name: targetName },
      notified: notificationId != null,
      pushed
    });
  } catch (error) {
    console.error('[roles/assign] error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Internal server error' },
      { status: 500 }
    );
  }
}
