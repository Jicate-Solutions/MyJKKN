import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest) {
  try {
    console.log('=== User Auth Management API Called ===');

    // Check if service role key is available
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error(
        'SUPABASE_SERVICE_ROLE_KEY environment variable is not set'
      );
      return NextResponse.json(
        { error: 'Server configuration error: Missing service role key' },
        { status: 500 }
      );
    }

    // Create admin client with service role key (server-side only)
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

    // Verify the requesting user has permission
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    if (!user) {
      console.error('No user found in request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Requesting user:', user.email);

    // Check if user has admin permissions
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return NextResponse.json(
        { error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    if (!profile) {
      console.error('No profile found for user:', user.id);
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    console.log('User role:', profile.role);

    if (!['super_admin', 'administrator'].includes(profile.role)) {
      console.error(
        'Insufficient permissions for user:',
        user.email,
        'Role:',
        profile.role
      );
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, email } = body;

    console.log('Request body:', { action, email });

    if (!action || !email) {
      console.error('Missing required fields:', { action, email });
      return NextResponse.json(
        { error: 'Missing required fields: action, email' },
        { status: 400 }
      );
    }

    console.log('Attempting to list users with admin client...');

    // Find the user by email
    const { data: users, error: listError } = (await supabaseAdmin.auth.admin.listUsers()) as { data: { users: any[] } | null; error: any };

    if (listError) {
      console.error('Error listing users with admin client:', listError);
      return NextResponse.json(
        { error: `Failed to find user: ${listError.message}` },
        { status: 500 }
      );
    }

    console.log('Successfully listed users, count:', users?.users.length);

    const targetUser = users?.users.find((u: any) => u.email === email);

    if (!targetUser) {
      console.error('Target user not found:', email);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('Found target user:', targetUser.id, targetUser.email);

    // Perform the requested action
    let result;
    switch (action) {
      case 'disable':
        console.log('Disabling user account...');
        // Simply update user metadata to mark as disabled
        result = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
          user_metadata: {
            ...targetUser.user_metadata,
            account_disabled: true,
            disabled_reason: 'Student status changed to exited',
            disabled_at: new Date().toISOString()
          }
        });
        break;

      case 'enable':
        console.log('Enabling user account...');
        // Remove the disabled flag from user metadata
        result = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
          user_metadata: {
            ...targetUser.user_metadata,
            account_disabled: false,
            disabled_reason: null,
            enabled_at: new Date().toISOString()
          }
        });
        break;

      default:
        console.error('Invalid action:', action);
        return NextResponse.json(
          { error: 'Invalid action. Use "disable" or "enable"' },
          { status: 400 }
        );
    }

    if (result.error) {
      console.error('Error updating user:', result.error);
      return NextResponse.json(
        { error: `Failed to update user account: ${result.error.message}` },
        { status: 500 }
      );
    }

    console.log('Successfully updated user account:', action);

    // Also update the profile is_active status
    try {
      const isActive = action === 'enable';
      console.log(
        `Updating profile is_active to ${isActive} for user:`,
        targetUser.email
      );

      const { error: profileUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: isActive })
        .eq('email', email);

      if (profileUpdateError) {
        console.error('Error updating profile status:', profileUpdateError);
        // Don't fail the entire operation, just log the error
      } else {
        console.log('Successfully updated profile is_active status');
      }
    } catch (profileError) {
      console.error('Error updating profile:', profileError);
      // Don't fail the entire operation
    }

    return NextResponse.json({
      success: true,
      message: `User account ${action}d successfully`,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        action
      }
    });
  } catch (error) {
    console.error('Error in user auth management API:', error);
    return NextResponse.json(
      {
        error: `Internal server error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      },
      { status: 500 }
    );
  }
}
