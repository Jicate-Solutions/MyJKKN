import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    console.log('=== EMAIL CHECK DEBUG ===');
    console.log('Checking email:', email);

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    // Check both auth.users and profiles table
    const [authListResult, profileResult] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers(),
      supabaseAdmin.from('profiles').select('id').eq('email', email).single()
    ]);

    const authUser = authListResult.data.users.find(
      (user) => user.email === email
    );

    console.log('Auth check result:', {
      data: authUser ? 'User found' : 'No user',
      error: authListResult.error?.message || 'No error'
    });

    console.log('Profile check result:', {
      data: profileResult.data ? 'Profile found' : 'No profile',
      error: profileResult.error?.message || 'No error'
    });

    // Check if email exists in either table
    const emailExistsInAuth = authUser !== undefined;
    const emailExistsInProfile = profileResult.data !== null;

    console.log('Email exists in auth:', emailExistsInAuth);
    console.log('Email exists in profile:', emailExistsInProfile);
    console.log('Profile error code:', profileResult.error?.code);

    const emailExists = emailExistsInAuth || emailExistsInProfile;

    console.log('Final result - Email exists:', emailExists);
    console.log('=== END EMAIL CHECK DEBUG ===');

    return NextResponse.json({
      available: !emailExists,
      message: emailExists
        ? 'This email is already registered'
        : 'Email is available'
    });
  } catch (error) {
    console.error('Email check error:', error);
    return NextResponse.json(
      { error: 'Failed to check email availability' },
      { status: 500 }
    );
  }
}
