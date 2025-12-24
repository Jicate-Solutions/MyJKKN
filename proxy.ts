import { createServerClient, CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';
import { profileCache } from './lib/auth/profile-cache';
import { routeMatcher } from './lib/auth/route-matcher';

// Define public paths - optimized with Set for O(1) lookup
const PUBLIC_PATHS_SET = new Set([
  '/', // Allow root path to avoid ERR_FAILED issues
  '/auth/login',
  '/auth/callback',
  '/auth/complete-profile',
  '/unauthorized',
  '/students/onboarding', // Add onboarding path for pending students
  '/billing/payment/success', // HDFC payment success callback
  '/billing/payment/failed', // HDFC payment failure callback
  '/sw.js',
  '/manifest.json',
  '/browserconfig.xml',
  '/pwa-test.html'
]);

// Regex for static assets - single check instead of multiple endsWith
const STATIC_ASSET_PATTERN =
  /^\/(_next|icons)|\.(?:js|css|png|ico|svg|json|xml|html|woff2?)$/;

// Optimized helper to check if path is public - O(1) lookup
const isPublicPath = (path: string): boolean => {
  // Fast exact match check (O(1))
  if (PUBLIC_PATHS_SET.has(path)) return true;

  // Single regex check for static assets and API routes
  if (STATIC_ASSET_PATTERN.test(path)) return true;

  // Special cases
  if (path.startsWith('/api') || path.includes('favicon.ico')) return true;

  return false;
};

export async function proxy(request: NextRequest) {
  try {
    const currentPath = request.nextUrl.pathname;

    // Special handling for PWA files
    if (currentPath === '/manifest.json') {
      const response = NextResponse.next();
      response.headers.set('Content-Type', 'application/manifest+json');
      response.headers.set(
        'Cache-Control',
        'public, max-age=31536000, immutable'
      );
      return response;
    }

    if (currentPath === '/sw.js') {
      const response = NextResponse.next();
      response.headers.set(
        'Content-Type',
        'application/javascript; charset=utf-8'
      );
      response.headers.set('Service-Worker-Allowed', '/');
      response.headers.set(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      return response;
    }

    // Special handling for root path to prevent cache issues
    if (currentPath === '/') {
      const response = NextResponse.next();
      response.headers.set(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      );
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      // Use static app version to prevent refresh loops
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
      response.headers.set('X-App-Version', appVersion);
      return response;
    }

    // Child app CORS removed - authentication now handled by separate auth server

    // Skip middleware for public paths BEFORE creating Supabase client
    if (isPublicPath(currentPath)) {
      const res = NextResponse.next();
      // Add cache headers for public paths too (but don't force reload)
      res.headers.set('Cache-Control', 'no-store, must-revalidate');
      // Remove dynamic timestamp that causes refreshes
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
      res.headers.set('X-App-Version', appVersion);
      return res;
    }

    const res = NextResponse.next();

    // Create supabase client only for non-public paths
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

    // Get and verify user - this sends a request to Supabase Auth server every time
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
      // FIXED: Clear stale profile cache on auth error to prevent stuck loading states
      if (user?.id) {
        profileCache.invalidate(user.id);
      }
      return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    if (!user) {
      const redirectUrl = new URL('/auth/login', request.url);
      redirectUrl.searchParams.set('redirectedFrom', currentPath);
      return NextResponse.redirect(redirectUrl);
    }

    // Add auth info to headers
    res.headers.set('x-user-id', user.id);
    res.headers.set('x-user-email', user.email || '');

    // Fetch and verify user profile - with caching for performance
    let profile = profileCache.get(user.id);

    if (!profile) {
      // Cache miss - fetch from database
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        // FIXED: Clear cache on profile fetch error
        profileCache.invalidate(user.id);
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }

      profile = data;
      // Store in cache for future requests (5-minute TTL)
      profileCache.set(user.id, profile);
    }

    // Check if user account is active
    if (profile.is_active === false) {
      // Clear the session and redirect to unauthorized page
      const redirectUrl = new URL('/unauthorized?reason=inactive', request.url);
      const response = NextResponse.redirect(redirectUrl);

      // Clear auth cookies
      response.cookies.delete('sb-access-token');
      response.cookies.delete('sb-refresh-token');

      return response;
    }

    // Student Role Access Control - Students are not allowed to access this application
    if (profile.role === 'student') {
      // If already on login page, don't redirect to avoid infinite loop
      if (currentPath === '/auth/login') {
        // Just sign out the user and let them stay on login page
        const response = NextResponse.next();

        // Clear all auth cookies
        response.cookies.delete('sb-access-token');
        response.cookies.delete('sb-refresh-token');

        // Sign out from Supabase
        await supabase.auth.signOut();

        return response;
      }

      // For other pages, redirect to login with message
      const studentBlockedResponse = NextResponse.redirect(
        new URL('/auth/login?reason=student_redirect', request.url)
      );

      // Clear all auth cookies
      studentBlockedResponse.cookies.delete('sb-access-token');
      studentBlockedResponse.cookies.delete('sb-refresh-token');

      // Sign out from Supabase
      await supabase.auth.signOut();

      return studentBlockedResponse;
    }

    // Check for disabled user accounts (applies to all users)
    if (user.user_metadata?.account_disabled === true) {
      // Account has been disabled - sign out and redirect
      const disabledResponse = NextResponse.redirect(
        new URL('/auth/login?reason=disabled', request.url)
      );

      // Clear all auth cookies
      disabledResponse.cookies.delete('sb-access-token');
      disabledResponse.cookies.delete('sb-refresh-token');

      // Also sign out from Supabase
      await supabase.auth.signOut();

      return disabledResponse;
    }

    // Check profile completion
    if (
      !profile.profile_completed &&
      !currentPath.includes('/auth/complete-profile') &&
      !currentPath.startsWith('/students/onboarding') && // Allow access to onboarding
      !currentPath.startsWith('/guest') // Allow access to guest page
    ) {
      return NextResponse.redirect(
        new URL('/auth/complete-profile', request.url)
      );
    }

    // Role-based routing
    // Handle guest users first
    if (profile.role === 'guest') {
      // Guest users can only access the guest page
      if (
        !currentPath.startsWith('/guest') &&
        !currentPath.startsWith('/auth')
      ) {
        return NextResponse.redirect(new URL('/guest', request.url));
      }
    } else if (profile.role === 'driver') {
      // Driver users can only access the driver page
      if (
        !currentPath.startsWith('/driver') &&
        !currentPath.startsWith('/auth')
      ) {
        return NextResponse.redirect(new URL('/driver', request.url));
      }
    } else {
      // Admin users trying to access guest or driver pages should be redirected to dashboard
      if (
        currentPath.startsWith('/guest') ||
        currentPath.startsWith('/driver')
      ) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    // Check protected routes access - enhanced with dynamic permissions
    // For custom roles, fetch permissions from database
    let userPermissions: Record<string, boolean> | undefined;

    if (
      profile.role &&
      ![
        'super_admin',
        'administrator',
        'faculty',
        'staff',
        'student',
        'guest',
        'driver',
        'hod'
      ].includes(profile.role)
    ) {
      // This is a custom role - fetch permissions from custom_roles table
      const { data: customRole } = await supabase
        .from('custom_roles')
        .select('permissions')
        .eq('name', profile.role)
        .eq('is_active', true)
        .single();

      if (customRole?.permissions) {
        userPermissions = customRole.permissions as Record<string, boolean>;
      }
    }

    // Check access with both role and permissions
    if (!routeMatcher.hasAccess(currentPath, profile.role, userPermissions)) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
    }

    // Add role info to headers if route is protected
    const routeConfig = routeMatcher.match(currentPath);
    if (routeConfig) {
      res.headers.set('x-user-role', profile.role);
      if (routeConfig.permission) {
        res.headers.set('x-required-permission', routeConfig.permission);
      }
    }

    // Cache control for authenticated routes
    res.headers.set('Cache-Control', 'no-store, must-revalidate');

    return res;
  } catch (error) {
    // Redirect to error page for critical failures
    return NextResponse.redirect(new URL('/error', request.url));
  }
}

export const config = {
  matcher: [
    // PWA files (must be explicitly handled)
    '/manifest.json',
    '/sw.js',
    '/browserconfig.xml',
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
    '/students/:path*',
    '/guest/:path*',
    '/driver/:path*',
    // Match all paths except public ones
    '/((?!_next/static|_next/image|favicon.ico|auth/login|auth/callback|auth/complete-profile|icons|pwa-test.html).*)'
  ]
};
