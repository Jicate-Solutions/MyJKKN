// middleware.ts
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define protected routes with exact paths and required roles
const protectedRoutes = {
  // '/applications/categories': ['super_admin', 'administrator'],
  //  '/applications/new': ['super_admin', 'administrator'],
  '/system/api-management': ['super_admin', 'administrator']
  // '/users': ['super_admin', 'administrator']
} as const;

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  try {
    // Get session
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

    // Get the exact path from the request
    const path = req.nextUrl.pathname;

    // Check if the exact path is protected
    if (protectedRoutes[path as keyof typeof protectedRoutes]) {
      const allowedRoles =
        protectedRoutes[path as keyof typeof protectedRoutes];

      // Get user profile to check role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session?.user.id)
        .single();

      if (!profile || !allowedRoles.includes(profile.role)) {
        // Redirect to unauthorized page
        return NextResponse.redirect(new URL('/unauthorized', req.url));
      }
    }

    return res;
  } catch (error) {
    console.error('Middleware error:', error);
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }
}

export const config = {
  matcher: [
    // Add specific protected routes
    // '/applications/categories',
    // '/applications/new',
    '/system/api-management',
    // '/users',

    // Skip auth check for public files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)'
  ]
};
