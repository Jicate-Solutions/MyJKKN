// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  // Refresh session if it exists
  const {
    data: { session }
  } = await supabase.auth.getSession();

  // If no session and not on auth pages, redirect to login
  if (!session && !req.nextUrl.pathname.startsWith('/auth')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/auth/login';
    redirectUrl.searchParams.set('redirectedFrom', req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Add user session to response headers
  if (session) {
    res.headers.set('x-user-id', session.user.id);
    res.headers.set('x-user-email', session.user.email || '');
  }

  return res;
}

export const config = {
  matcher: [
    // Protected routes that require authentication
    '/applications/:path*',
    '/system/:path*',
    '/users/:path*',

    // Skip auth check for public files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)'
  ]
};
