// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Get session
  const {
    data: { session }
  } = await supabase.auth.getSession();

  // If no session, redirect to login
  if (!session) {
    const redirectUrl = new URL('/auth/login', req.url);
    redirectUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  try {
    // Get user profile with role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    const currentPath = req.nextUrl.pathname;

    // Check each protected route configuration
    for (const [_, config] of Object.entries(PROTECTED_ROUTES)) {
      if (config.paths.some((path) => currentPath.startsWith(path))) {
        // If user's role is not in the allowed roles, redirect to unauthorized
        if (!profile?.role || !config.roles.includes(profile.role)) {
          return NextResponse.redirect(new URL('/unauthorized', req.url));
        }
      }
    }
  } catch (error) {
    // On error, redirect to unauthorized
    console.error('Middleware error:', error);
    return NextResponse.redirect(new URL('/unauthorized', req.url));
  }

  return res;
}

export const config = {
  matcher: [
    // Add all your protected path patterns here
    '/system/:path*',
    '/settings/:path*',
    '/reports/:path*',
    '/analytics/:path*',
    '/academic/:path*',
    '/courses/:path*',
    // Exclude auth and public files
    '/((?!api|_next/static|_next/image|favicon.ico|auth).*)'
  ]
};
