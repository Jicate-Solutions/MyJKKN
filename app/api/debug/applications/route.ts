import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          }
        }
      }
    );

    // Get auth user
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json(
        { error: 'Authentication error', message: userError.message },
        { status: 401 }
      );
    }

    // Get user profile/role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user?.id || '')
      .single();

    // Get raw applications data
    const { data: applications, error: appsError } = await supabase
      .from('applications')
      .select('*');

    // Return debug info
    return NextResponse.json({
      user: {
        id: user?.id,
        email: user?.email
      },
      profile: profile || null,
      profileError: profileError ? profileError.message : null,
      applications: applications
        ? applications.map((app) => ({
            id: app.id,
            name: app.name,
            roles_access: app.roles_access
          }))
        : [],
      applicationsError: appsError ? appsError.message : null,
      message:
        'This is a debug endpoint to help troubleshoot application access issues.'
    });
  } catch (error) {
    console.error('Debug API error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
