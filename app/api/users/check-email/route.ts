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

    // For OAuth-only system, only check profiles table (including pre-registered)
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at, is_pre_registered')
      .eq('email', email)
      .single();

    console.log('Profile check result:', {
      data: profileData ? 'Profile found' : 'No profile',
      isPreRegistered: profileData?.is_pre_registered,
      error: profileError?.message || 'No error'
    });

    const emailExists = profileData !== null;

    console.log('Final result - Email exists:', emailExists);
    console.log('=== END EMAIL CHECK DEBUG ===');

    // Prepare user details for better UX
    let existingUserDetails = null;
    let isPreRegistered = false;
    
    if (emailExists && profileData) {
      isPreRegistered = profileData.is_pre_registered || false;
      existingUserDetails = {
        id: profileData.id,
        email: profileData.email,
        fullName: profileData.full_name,
        role: profileData.role,
        isActive: profileData.is_active,
        isPreRegistered: isPreRegistered,
        createdAt: profileData.created_at
      };
    }

    // Different messages based on registration status
    let message = 'Email is available';
    let suggestion = null;
    
    if (emailExists) {
      if (isPreRegistered) {
        message = 'This email is pre-registered and pending Google login';
        suggestion = 'The user can login with Google using this email address.';
      } else {
        message = 'This email is already registered with an active account';
        suggestion = 'Please use a different email address or check if you meant to update the existing user.';
      }
    }

    return NextResponse.json({
      available: !emailExists,
      message,
      existingUser: existingUserDetails,
      isPreRegistered,
      suggestion
    });
  } catch (error) {
    console.error('Email check error:', error);
    return NextResponse.json(
      { error: 'Failed to check email availability' },
      { status: 500 }
    );
  }
}
