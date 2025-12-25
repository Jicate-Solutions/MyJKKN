import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This API endpoint helps fix driver authentication issues
// where users were created with email provider instead of Google OAuth

export async function POST(request: NextRequest) {
  try {
    // Check if user is authorized (you should add proper auth check here)
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Create admin supabase client
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

    // Check if user exists with email provider
    const { data: authUser } = (await supabaseAdmin.auth.admin.listUsers()) as { data: { users: any[] } | null };
    const userWithEmail = authUser?.users.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!userWithEmail) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check the provider
    const provider = userWithEmail.app_metadata?.provider;
    
    if (provider === 'google') {
      return NextResponse.json({ 
        message: 'User already has Google OAuth configured',
        provider: provider 
      }, { status: 200 });
    }

    // Delete the user (this will allow them to re-register with Google)
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      userWithEmail.id
    );

    if (deleteError) {
      return NextResponse.json({ 
        error: 'Failed to delete user', 
        details: deleteError.message 
      }, { status: 500 });
    }

    // Also delete the profile if it exists
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userWithEmail.id);

    return NextResponse.json({
      message: 'User successfully removed. They can now sign up with Google OAuth.',
      deletedUser: {
        id: userWithEmail.id,
        email: userWithEmail.email,
        previousProvider: provider
      }
    }, { status: 200 });

  } catch (error: any) {
    console.error('Fix driver auth error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to check user's current auth status
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET_KEY}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

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

    // Get user details
    const { data: authUser } = (await supabaseAdmin.auth.admin.listUsers()) as { data: { users: any[] } | null };
    const userWithEmail = authUser?.users.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!userWithEmail) {
      return NextResponse.json({ 
        exists: false,
        message: 'User not found in auth.users' 
      }, { status: 200 });
    }

    // Check profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    return NextResponse.json({
      exists: true,
      auth: {
        id: userWithEmail.id,
        email: userWithEmail.email,
        provider: userWithEmail.app_metadata?.provider,
        providers: userWithEmail.app_metadata?.providers,
        hasGoogleIdentity: userWithEmail.identities?.some(i => i.provider === 'google'),
        createdAt: userWithEmail.created_at,
        lastSignIn: userWithEmail.last_sign_in_at
      },
      profile: profile ? {
        id: profile.id,
        role: profile.role,
        isActive: profile.is_active,
        profileCompleted: profile.profile_completed
      } : null,
      recommendation: userWithEmail.app_metadata?.provider !== 'google' 
        ? 'User should be deleted and re-created with Google OAuth'
        : 'User is properly configured'
    }, { status: 200 });

  } catch (error: any) {
    console.error('Check driver auth error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}