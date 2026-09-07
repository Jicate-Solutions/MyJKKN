export const dynamic = 'force-dynamic';

import { NextResponse , connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';


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
  await connection();
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    // This endpoint is reachable UNAUTHENTICATED — the signup flow checks
    // whether an email is already taken before the visitor has logged in.
    // It must therefore never return the matched profile's record: doing so
    // lets anyone on the internet enumerate accounts and privileged roles.
    // Select only the flag the availability message needs; never id / name /
    // role / status / created_at.
    const { data: profileData } = await supabaseAdmin
      .from('profiles')
      .select('is_pre_registered')
      .eq('email', email)
      .single();

    const emailExists = profileData !== null;
    const isPreRegistered = emailExists
      ? profileData?.is_pre_registered || false
      : false;

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

    // Availability only — no user record is returned to unauthenticated callers.
    return NextResponse.json({
      available: !emailExists,
      message,
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
