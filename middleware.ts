import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  console.log('Middleware checking route:', req.nextUrl.pathname);

  // Optional: Set CORS headers if needed
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  try {
    // Refresh session
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error in middleware:', sessionError);
      return NextResponse.redirect(new URL('/auth/login', req.url));
    }

    // Define protected and public paths
    const isAuthPath = req.nextUrl.pathname.startsWith('/auth');
    const isCallbackPath = req.nextUrl.pathname === '/auth/callback';
    const isProfileCompletionPath =
      req.nextUrl.pathname === '/auth/complete-profile';

    // Allow callback path to proceed without checks
    if (isCallbackPath) {
      console.log('Allowing callback path to proceed');
      return res;
    }

    // If no session, only allow public paths
    if (!session) {
      console.log('No session found');
      if (!isAuthPath) {
        console.log('Redirecting to login');
        return NextResponse.redirect(new URL('/auth/login', req.url));
      }
      return res;
    }

    // Check profile completion status
    const { data: profile } = await supabase
      .from('profiles')
      .select('profile_completed, role')
      .eq('id', session.user.id)
      .single();

    console.log('Profile status:', {
      exists: !!profile,
      completed: profile?.profile_completed,
      currentPath: req.nextUrl.pathname
    });

    // If profile is not complete, force profile completion
    if (!profile?.profile_completed && !isProfileCompletionPath) {
      console.log('Redirecting to profile completion');
      return NextResponse.redirect(new URL('/auth/complete-profile', req.url));
    }

    // If trying to access auth pages with a completed profile
    if (isAuthPath && profile?.profile_completed) {
      console.log(
        'Completed profile accessing auth path, redirecting to dashboard'
      );
      return NextResponse.redirect(new URL('/', req.url));
    }

    console.log('Middleware check complete, proceeding');
    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    // On error, redirect to login but preserve the error
    const redirectUrl = new URL('/auth/login', req.url);
    redirectUrl.searchParams.set('error', 'middleware_error');
    return NextResponse.redirect(redirectUrl);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)']
};
