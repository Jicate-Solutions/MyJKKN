export const dynamic = 'force-dynamic';

/**
 * POST /api/users/[id]/workspace-suspend
 *
 * Suspend (or unsuspend) the target user's Google Workspace account as part of
 * offboarding. Because MyJKKN login IS Google OAuth restricted to @jkkn.ac.in,
 * suspending the Workspace account also blocks MyJKKN login — this is the
 * upstream master switch, not a MyJKKN-only toggle.
 *
 * Guardrails (defense-in-depth):
 *   - super_admin caller only.
 *   - Cannot target yourself.
 *   - Fails closed (501) when the Workspace admin integration is not configured.
 *   - Never suspends a Workspace admin (enforced in the helper).
 *   - Suspend is reversible; NO delete path is exposed.
 *   - Every call is written to user_activity_logs.
 *
 * Body: { action: 'suspend' | 'unsuspend', alsoSignOut?: boolean }
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { logActivity } from '@/lib/utils/activity-logger';
import { RESOURCE_TYPES } from '@/types/activity';
import {
  isWorkspaceAdminConfigured,
  suspendWorkspaceUser,
  unsuspendWorkspaceUser,
  signOutWorkspaceUser,
  type WorkspaceActionResult,
} from '@/lib/google/workspace-admin';

function reasonToStatus(reason?: WorkspaceActionResult['reason']): number {
  switch (reason) {
    case 'not_configured':
      return 501;
    case 'not_found':
      return 404;
    case 'is_admin':
      return 403;
    case 'api_error':
      return 502;
    default:
      return 400;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: userId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      alsoSignOut?: boolean;
    };
    const action = body.action === 'unsuspend' ? 'unsuspend' : 'suspend';

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
          },
        },
      }
    );

    // AuthN
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // AuthZ — super_admin only (stricter than the deactivate route on purpose:
    // this can lock a person out of their entire Google identity).
    const { data: currentUser, error: currentUserError } = await supabase
      .from('profiles')
      .select('role, full_name, institution_id')
      .eq('id', user.id)
      .single();
    if (currentUserError || currentUser?.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only a super administrator can suspend Workspace accounts' },
        { status: 403 }
      );
    }

    // Cannot target yourself.
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot suspend your own Workspace account' },
        { status: 400 }
      );
    }

    // Resolve the target's Workspace email.
    const { data: targetUser, error: targetErr } = await supabase
      .from('profiles')
      .select('email, full_name, role')
      .eq('id', userId)
      .single();
    if (targetErr || !targetUser?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fail closed if the integration is not wired up in this environment.
    if (!isWorkspaceAdminConfigured()) {
      return NextResponse.json(
        {
          error:
            'Google Workspace admin integration is not configured. Add the admin.directory.user scope and set GOOGLE_ADMIN_IMPERSONATE_SUBJECT.',
        },
        { status: 501 }
      );
    }

    const email = targetUser.email as string;
    const result =
      action === 'suspend'
        ? await suspendWorkspaceUser(email)
        : await unsuspendWorkspaceUser(email);

    // Optional immediate session kill on suspend.
    let signOut: WorkspaceActionResult | null = null;
    if (result.ok && action === 'suspend' && body.alsoSignOut) {
      signOut = await signOutWorkspaceUser(email);
    }

    // Audit — record attempt outcome regardless of success.
    await logActivity({
      userId: user.id,
      actionType: action === 'suspend' ? 'workspace_suspend' : 'workspace_unsuspend',
      resourceType: RESOURCE_TYPES.USER,
      resourceId: userId,
      resourceName: (targetUser.full_name as string) || email,
      description: `${result.ok ? 'Succeeded' : 'Failed'}: ${action} Google Workspace account for ${email}`,
      request,
      metadata: {
        target_email: email,
        target_role: targetUser.role,
        action,
        also_sign_out: Boolean(body.alsoSignOut),
        result_ok: result.ok,
        result_reason: result.reason ?? null,
        sign_out_ok: signOut?.ok ?? null,
      },
      institutionId: currentUser?.institution_id,
      statusCode: result.ok ? 200 : reasonToStatus(result.reason),
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.message ?? result.reason, reason: result.reason },
        { status: reasonToStatus(result.reason) }
      );
    }

    return NextResponse.json({
      success: true,
      action,
      email,
      suspended: result.info?.suspended,
      alreadyInState: result.reason === 'already_in_state',
      signedOut: signOut?.ok ?? false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Workspace suspend failed',
      },
      { status: 500 }
    );
  }
}
