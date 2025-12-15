import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  createServiceRoleClient
} from '@/lib/supabase/server';
import { z } from 'zod';

const bulkRoleUpdateSchema = z.object({
  userIds: z.array(z.string().uuid()),
  role: z.string().min(1)
});

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user has permission to update roles (super_admin only)
    const { data: profile } = await (supabase.from('profiles') as any)
      .select('role')
      .eq('id', user.id)
      .single();

    if (
      !profile ||
      (profile.role !== 'super_admin' && profile.role !== 'administrator')
    ) {
      return NextResponse.json(
        {
          error:
            'Insufficient permissions. Only super admins and administrators can update roles.'
        },
        { status: 403 }
      );
    }

    // Validate request body
    const json = await request.json();
    const { userIds, role } = bulkRoleUpdateSchema.parse(json);

    // Validate that the role exists
    const { data: roleExists } = await supabase
      .from('custom_roles')
      .select('role_key')
      .eq('role_key', role)
      .single();

    if (!roleExists) {
      return NextResponse.json(
        { error: 'Invalid role specified' },
        { status: 400 }
      );
    }

    // Prevent updating super_admin users (except by other super_admins)
    const { data: targetUsers } = await (supabase.from('profiles') as any)
      .select('id, role, full_name, email')
      .in('id', userIds);

    if (!targetUsers) {
      return NextResponse.json(
        { error: 'No users found with the provided IDs' },
        { status: 404 }
      );
    }

    const success: string[] = [];
    const failed: Array<{ userId: string; error: string }> = [];

    // Use service role client for admin operations to bypass RLS
    const serviceClient = createServiceRoleClient();

    // Process each user individually for better error handling
    for (const targetUser of targetUsers as any[]) {
      try {
        // Prevent modifying super_admin roles unless the new role is also super_admin
        if (targetUser.role === 'super_admin' && role !== 'super_admin') {
          failed.push({
            userId: targetUser.id,
            error: 'Cannot modify super admin role'
          });
          continue;
        }

        // Update the user's role using service role client
        const { error: updateError } = await (
          serviceClient.from('profiles') as any
        )
          .update({
            role,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetUser.id);

        if (updateError) {
          failed.push({
            userId: targetUser.id,
            error: updateError.message
          });
        } else {
          success.push(targetUser.id);
        }
      } catch (error) {
        failed.push({
          userId: targetUser.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success,
      failed,
      message: `Updated ${success.length} user(s), ${failed.length} failed`
    });
  } catch (error) {
    console.error('Bulk role update error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
