export const dynamic = 'force-dynamic';

// POST /api/users/roles/assign — assign a role to a user AND notify them immediately.
//
// Why this is a server route (not a client-side UserRolesService.addRole call):
// the user_roles INSERT RLS policy checks profiles.role IN ('super_admin','admin'),
// while the permissions-audit page/search gates admit 'administrator'. A browser
// insert could pass the UI gate yet be RLS-blocked. Doing the write here with the
// service-role client behind an explicit super-admin check gives one audited path
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

function checkFailed(error: unknown) {
  console.error('[roles/assign] check failed:', error);
  return NextResponse.json(
    { error: 'Could not check this request. Nothing was changed.' },
    { status: 500 }
  );
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

    // ── Gate: super admins only (Director, 8 Oct 2026) ──
    // "Admins need not give any role. We have enough super admins." Super admin
    // means the is_super_admin flag, asked as the caller's own session; no
    // role key, primary or otherwise, opens this route.
    //
    // #4254 also edits this file and the other role-writing routes
    // (/api/users/[id]/role, /api/users/bulk-role-update, ...). Whichever PR
    // merges second keeps BOTH: this super-admin-only gate, the self-assign
    // refusal and the 500-on-error below, plus #4254's refuseRoleChange. The
    // other role-writing routes move to the same super-admin-only rule after
    // #4254 merges.
    const superResult = await supabase.rpc('is_super_admin');
    if (superResult.error) return checkFailed(superResult.error);
    if (superResult.data !== true) {
      return NextResponse.json(
        { error: 'Only a super admin can give roles.' },
        { status: 403 }
      );
    }

    // Nobody gives a role to themselves, super admins included. Checked again
    // below on the resolved profile id, since the uuid column also accepts
    // upper case, braces and the no-hyphen form.
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot change your own roles; ask another super admin.' },
        { status: 403 }
      );
    }

    // Name for the notification only; not a check.
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

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
    const roleId = (role as { id: string }).id;
    const roleName = (role as { role_name?: string }).role_name || roleKey;

    // Confirm the target user exists.
    const { data: target, error: targetErr } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', userId)
      .maybeSingle();
    if (targetErr) return checkFailed(targetErr);
    if (!target) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }
    if ((target as { id: string }).id === user.id) {
      return NextResponse.json(
        { error: 'You cannot change your own roles; ask another super admin.' },
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
