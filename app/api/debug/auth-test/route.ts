import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Test auth
    const authStart = Date.now();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authDuration = Date.now() - authStart;

    if (authError || !authData.user) {
      return NextResponse.json(
        {
          error: 'No authenticated user',
          authError: authError?.message,
          authDuration
        },
        { status: 401 }
      );
    }

    const userId = authData.user.id;

    // Test profile fetch
    const profileStart = Date.now();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    const profileDuration = Date.now() - profileStart;

    // Test simple count
    const countStart = Date.now();
    const { count, error: countError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('id', userId);
    const countDuration = Date.now() - countStart;

    return NextResponse.json({
      success: true,
      userId,
      authDuration,
      profileDuration,
      countDuration,
      results: {
        hasProfile: !!profile,
        profileError: profileError?.message,
        profileErrorCode: profileError?.code,
        count,
        countError: countError?.message
      },
      userEmail: authData.user.email,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Debug test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
