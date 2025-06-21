import { Database } from '@/types/auth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { logActivity, ActivityTemplates } from '@/lib/utils/activity-logger';
import { RESOURCE_TYPES } from '@/types/activity';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
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

    // Check authentication
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify admin permissions
    const { data: currentUser, error: currentUserError } = await supabase
      .from('profiles')
      .select('role, full_name, institution_id')
      .eq('id', user.id)
      .single();

    if (
      currentUserError ||
      !['super_admin', 'administrator'].includes(currentUser.role)
    ) {
      return NextResponse.json(
        { error: 'Only administrators can deactivate users' },
        { status: 403 }
      );
    }

    // Check if trying to deactivate a super admin
    const { data: targetUser, error: targetUserError } = await supabase
      .from('profiles')
      .select('role, full_name, email')
      .eq('id', params.id)
      .single();

    if (targetUserError) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (targetUser.role === 'super_admin') {
      return NextResponse.json(
        { error: 'Cannot deactivate a super admin account' },
        { status: 403 }
      );
    }

    // Deactivate user
    const { data, error } = await supabase
      .from('profiles')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    // Log the user deactivation activity
    const actorName = currentUser?.full_name || 'Unknown';
    const targetName = targetUser?.full_name || 'Unknown';
    const template = ActivityTemplates.userDeactivated(actorName, targetName);

    await logActivity({
      userId: user.id,
      actionType: template.actionType,
      resourceType: template.resourceType,
      resourceId: params.id,
      resourceName: targetName,
      description: template.description,
      request,
      metadata: {
        target_user_id: params.id,
        target_email: targetUser?.email,
        target_role: targetUser?.role,
        deactivated_by_role: currentUser?.role
      },
      institutionId: currentUser?.institution_id,
      statusCode: 200
    });

    return NextResponse.json({
      success: true,
      user: data
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
