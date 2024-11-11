// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  // Add public paths that don't need auth
  const publicPaths = [
    '/auth/login',
    '/auth/callback',
    '/auth/complete-profile'
  ];
  const isPublicPath = publicPaths.includes(req.nextUrl.pathname);

  if (!session && !isPublicPath) {
    const redirectUrl = new URL('/auth/login', req.url);
    redirectUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Add auth user info to request headers
  if (session) {
    res.headers.set('x-user-id', session.user.id);
    res.headers.set('x-user-email', session.user.email || '');
  }

  try {
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      const currentPath = req.nextUrl.pathname;

      // Check protected routes
      for (const [_, config] of Object.entries(PROTECTED_ROUTES)) {
        if (config.paths.some((path) => currentPath.startsWith(path))) {
          if (!profile?.role || !config.roles.includes(profile.role)) {
            return NextResponse.redirect(new URL('/unauthorized', req.url));
          }
        }
      }

      // Redirect to complete profile if needed
      if (
        !profile?.profile_completed &&
        !currentPath.includes('/auth/complete-profile')
      ) {
        return NextResponse.redirect(
          new URL('/auth/complete-profile', req.url)
        );
      }
    }
  } catch (error) {
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
