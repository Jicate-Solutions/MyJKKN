import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define public paths that don't need auth
const publicPaths = ['/auth/login', '/auth/callback', '/auth/complete-profile'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Check if path is public
  if (publicPaths.includes(req.nextUrl.pathname)) {
    return res;
  }

  const supabase = createMiddlewareClient({ req, res });

  try {
    // Get session from Supabase (this uses cached session when available)
    const {
      data: { session }
    } = await supabase.auth.getSession();

    // If no session, redirect to login
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', req.url));
    }

    // Use request headers to pass user info to the application
    // This avoids making the same database calls repeatedly
    res.headers.set('x-user-id', session.user.id);
    res.headers.set('x-user-role', session.user.role ?? '');

    // Only check profile completion for non-API routes
    if (!req.nextUrl.pathname.startsWith('/api')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('profile_completed')
        .eq('id', session.user.id)
        .single();

      if (!profile?.profile_completed) {
        return NextResponse.redirect(
          new URL('/auth/complete-profile', req.url)
        );
      }
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.redirect(
      new URL('/auth/login?error=middleware_error', req.url)
    );
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)'
  ]
};
