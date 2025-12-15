import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { Database } from '@/types/auth';
import { createClient } from '@supabase/supabase-js';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';

// Create admin client for user management
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params;

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

    // Get current user for authorization
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get current user's profile to check permissions
    const { data: currentProfile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: 'Error fetching user profile' },
        { status: 500 }
      );
    }

    // Check permissions: only admins can toggle user status
    const canToggleStatus = ['super_admin', 'administrator'].includes(
      currentProfile.role
    );

    if (!canToggleStatus) {
      return NextResponse.json(
        { error: 'Insufficient permissions to toggle user status' },
        { status: 403 }
      );
    }

    // Get target user's current status
    const { data: targetUser, error: targetUserError } = await supabase
      .from('profiles')
      .select('is_active, full_name, email, role')
      .eq('id', userId)
      .single();

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent super_admin from being deactivated by non-super_admin
    if (
      targetUser.role === 'super_admin' &&
      currentProfile.role !== 'super_admin'
    ) {
      return NextResponse.json(
        { error: 'Only super admins can modify other super admin accounts' },
        { status: 403 }
      );
    }

    // Prevent users from deactivating themselves
    if (user.id === userId) {
      return NextResponse.json(
        { error: 'You cannot deactivate your own account' },
        { status: 400 }
      );
    }

    // Toggle the status
    const newStatus = !targetUser.is_active;

    // Update user status using admin client to bypass RLS
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        is_active: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('[user-management/toggle-status] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update user status', details: updateError.message },
        { status: 500 }
      );
    }

    // Log the status change activity
    const actorName = currentProfile?.full_name || 'Unknown';
    const targetName = targetUser?.full_name || 'Unknown';
    const action = newStatus ? 'activated' : 'deactivated';

    const template = {
      actionType: `user_${action}` as const,
      resourceType: 'user' as const,
      description: `${actorName} ${action} user account for ${targetName}`
    };

    await logActivity({
      userId: user.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: userId,
      resourceName: targetName,
      description: template.description,
      request,
      metadata: {
        target_user_id: userId,
        target_email: targetUser.email,
        target_role: targetUser.role,
        previous_status: targetUser.is_active,
        new_status: newStatus,
        changed_by_role: currentProfile?.role
      },
      institutionId: currentProfile?.institution_id,
      statusCode: 200
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: `User ${action} successfully`
    });
  } catch (error) {
    console.error('[user-management/toggle-status] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
