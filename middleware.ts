import { createServerClient, CookieOptions } from '@supabase/ssr';
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
  try {
    const res = NextResponse.next();

    // Create supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async get(name: string) {
            const cookie = request.cookies.get(name);
            return cookie?.value ?? '';
          },
          async set(name: string, value: string, options: CookieOptions) {
            res.cookies.set({ name, value });
          },
          async remove(name: string, options: CookieOptions) {
            res.cookies.delete(name);
          }
        }
      }
    );

    const currentPath = request.nextUrl.pathname;

    // Skip middleware for public paths
    if (isPublicPath(currentPath)) {
      return res;
    }

    // Get and verify session
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('Session error:', sessionError);
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    if (!session) {
      const redirectUrl = new URL('/auth/login', request.url);
      redirectUrl.searchParams.set('redirectedFrom', currentPath);
      return NextResponse.redirect(redirectUrl);
    }

    // Force session refresh if token is about to expire (within 1 minute)
    if (session.expires_at && Date.now() > session.expires_at * 1000 - 60000) {
      const { data: refreshedSession, error: refreshError } =
        await supabase.auth.refreshSession();

      if (refreshError || !refreshedSession.session) {
        console.error('Session refresh error:', refreshError);
        return NextResponse.redirect(new URL('/auth/login', request.url));
      }
    }

    // Add auth info to headers
    res.headers.set('x-user-id', session.user.id);
    res.headers.set('x-user-email', session.user.email || '');
    res.headers.set('x-session-expires', session.expires_at?.toString() || '');

    // Fetch and verify user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // Check profile completion
    if (
      !profile.profile_completed &&
      !currentPath.includes('/auth/complete-profile')
    ) {
      return NextResponse.redirect(
        new URL('/auth/complete-profile', request.url)
      );
    }

    // Check protected routes access
    for (const [_, config] of Object.entries(PROTECTED_ROUTES)) {
      if (config.paths.some((path) => currentPath.startsWith(path))) {
        // Verify role-based access
        if (!profile.role || !config.roles.includes(profile.role)) {
          console.warn(
            `Access denied to ${currentPath} for role ${profile.role}`
          );
          return NextResponse.redirect(new URL('/unauthorized', request.url));
        }

        // Add role info to headers for protected routes
        res.headers.set('x-user-role', profile.role);
      }
    }

    // Cache control for authenticated routes
    res.headers.set('Cache-Control', 'no-store, must-revalidate');

    return res;
  } catch (error) {
    // Log the error with context
    console.error('Middleware critical error:', {
      error,
      path: request.nextUrl.pathname,
      timestamp: new Date().toISOString()
    });

    // Redirect to error page for critical failures
    return NextResponse.redirect(new URL('/error', request.url));
  }
}

export const config = {
  matcher: [
    // Protected routes
    '/system/:path*',
    '/settings/:path*',
    '/reports/:path*',
    '/organizations/:path*',
    '/analytics/:path*',
    '/academic/:path*',
    '/courses/:path*',
    '/profile/:path*',
    '/users/:path*',
    // Match all paths except public ones
    '/((?!_next/static|_next/image|favicon.ico|api|auth/login|auth/callback|auth/complete-profile).*)'
  ]
};
