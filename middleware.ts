import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';

// Define public paths
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/callback',
  '/auth/complete-profile'
];

// Helper to check if path is public
const isPublicPath = (path: string) =>
  PUBLIC_PATHS.includes(path) ||
  path.startsWith('/_next') ||
  path.startsWith('/api') ||
  path.includes('favicon.ico');

export async function middleware(request: NextRequest) {
  // Only run on protected routes
  const path = request.nextUrl.pathname;
  if (path.startsWith('/_next') || path.includes('/auth/') || path === '/') {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value;
        },
        set(name, value, options) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          res.cookies.delete({ name, ...options });
        }
      }
    }
  );

  // Verify user auth status
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // If no user, redirect to login
  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // If there is a user, continue but don't duplicate profile checks
  // Let page components handle specific access requirements

  return res;
}

export const config = {
  matcher: [
    // Protected routes only (not auth pages, static assets, etc.)
    '/((?!_next/static|_next/image|favicon.ico|api/auth|auth).*)'
  ]
};
