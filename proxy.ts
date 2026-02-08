import { createServerClient, CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';
import { profileCache } from './lib/auth/profile-cache';
import { routeMatcher } from './lib/auth/route-matcher';
import { FEATURE_FLAGS } from './lib/config/feature-flags';
import { StudentValidationService } from './lib/services/auth/student-validation-service';

// SECURITY: Helper to properly clear auth cookies with all necessary flags
// This prevents cookies from persisting on subdomains or over insecure connections
function clearAuthCookies(response: NextResponse) {
  const cookieNames = ['sb-access-token', 'sb-refresh-token'];
  const isProduction = process.env.NODE_ENV === 'production';

  cookieNames.forEach((name) => {
    response.cookies.set({
      name,
      value: '',
      maxAge: 0,
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax'
    });
  });
}

// Define public paths - optimized with Set for O(1) lookup
const PUBLIC_PATHS_SET = new Set([
  '/', // Allow root path to avoid ERR_FAILED issues
  '/auth/login',
  '/auth/callback',
  '/auth/complete-profile',
  '/auth/parent/login', // Parent portal OTP login
  '/auth/parent/register', // Parent portal registration
  '/auth/parent/callback', // Parent portal auth callback
  '/auth/authorize', // OAuth authorize endpoint
  '/unauthorized',
  '/students/onboarding', // Add onboarding path for pending students
  '/billing/payment/success', // HDFC payment success callback
  '/billing/payment/failed', // HDFC payment failure callback
  '/sw.js',
  '/manifest.json',
  '/browserconfig.xml',
  '/pwa-test.html',
  '/courses' // Public VAC course listing
]);

// Public path prefixes - paths that start with these are public
const PUBLIC_PATH_PREFIXES = ['/courses/'];

// SECURITY: Public API routes - only these API routes are accessible without auth
// All other /api/* routes require authentication
const PUBLIC_API_ROUTES = new Set([
  '/api/auth', // Auth endpoints (prefix)
  '/api/parent-portal/auth/request-otp',
  '/api/parent-portal/auth/verify-otp',
  '/api/parent-portal/auth/register',
  '/api/parent-portal/auth/csrf',
  '/api/courses', // Public course listings (prefix)
]);

// Helper to check if API route is public
const isPublicApiRoute = (path: string): boolean => {
  // Check exact matches
  if (PUBLIC_API_ROUTES.has(path)) return true;

  // Check prefix matches (e.g., /api/auth/* routes)
  const routes = Array.from(PUBLIC_API_ROUTES);
  for (const route of routes) {
    if (path.startsWith(route)) return true;
  }

  return false;
};

// Regex for static assets - single check instead of multiple endsWith
const STATIC_ASSET_PATTERN =
  /^\/(_next|icons)|\.(?:js|css|png|ico|svg|json|xml|html|woff2?)$/;

// Optimized helper to check if path is public - O(1) lookup
const isPublicPath = (path: string): boolean => {
  // Fast exact match check (O(1))
  if (PUBLIC_PATHS_SET.has(path)) return true;

  // Single regex check for static assets
  if (STATIC_ASSET_PATTERN.test(path)) return true;

  // SECURITY FIX: Only allow specific public API routes, not all /api/* routes
  if (path.startsWith('/api')) {
    return isPublicApiRoute(path);
  }

  // Special cases
  if (path.includes('favicon.ico')) return true;

  // Check public path prefixes (for nested public routes like /courses/[id])
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }

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

    // SECURITY: Parent portal authentication - TWO auth systems
    // 1. Admin routes (/parent-portal, /parent-portal/access, /parent-portal/communications) use Supabase auth
    // 2. Parent routes (/parent-portal/dashboard, /parent-portal/learner/*) use parent session cookies
    if (currentPath.startsWith('/parent-portal')) {
      // Admin routes - these are for staff managing the parent portal
      const isAdminRoute =
        currentPath === '/parent-portal' ||
        currentPath.startsWith('/parent-portal/access') ||
        currentPath.startsWith('/parent-portal/communications') ||
        currentPath.startsWith('/parent-portal/feedback');

      if (isAdminRoute) {
        // Skip parent auth check - this will fall through to regular Supabase auth below
        // Do nothing here, let the regular middleware handle it
      } else {
        // Parent-facing routes - require parent session
        const parentSessionToken = request.cookies.get('parent_session')?.value;

        // If no parent session, redirect to parent login
        if (!parentSessionToken) {
          return NextResponse.redirect(
            new URL('/auth/parent/login', request.url)
          );
        }

        // Parent session exists - allow access
        // Session validation happens at API level in ParentSessionService
        const res = NextResponse.next();
        res.headers.set('Cache-Control', 'no-store, must-revalidate');
        res.headers.set('x-parent-session', 'true'); // Marker for debugging
        return res;
      }
    }

    // SECURITY: Parent portal API routes - TWO auth systems
    // 1. Parent-facing API routes require parent session cookies
    // 2. Admin API routes require Supabase auth (handled by regular middleware)
    if (
      currentPath.startsWith('/api/parent-portal') &&
      !isPublicApiRoute(currentPath)
    ) {
      // Parent-facing API routes (dashboard, learners, profile for parents)
      const isParentApiRoute =
        currentPath === '/api/parent-portal/dashboard' ||
        currentPath.startsWith('/api/parent-portal/learner/') ||
        currentPath.startsWith('/api/parent-portal/learners') ||
        currentPath.startsWith('/api/parent-portal/profile') ||
        currentPath === '/api/parent-portal/auth/logout';

      if (isParentApiRoute) {
        const parentSessionToken = request.cookies.get('parent_session')?.value;

        if (!parentSessionToken) {
          return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
          );
        }

        // Parent session exists - allow API access
        // Actual validation happens in the API route via ParentSessionService
        const res = NextResponse.next();
        return res;
      }

      // Admin API routes - skip here, will be handled by regular Supabase auth below
      // This includes routes for managing access, communications, etc.
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
            // SECURITY: Pass through all cookie options including httpOnly, secure, sameSite
            // This ensures auth tokens are protected from XSS attacks
            res.cookies.set({
              name,
              value,
              ...options,
              // Ensure secure defaults for auth cookies
              httpOnly: options.httpOnly ?? true,
              secure: options.secure ?? process.env.NODE_ENV === 'production',
              sameSite: options.sameSite ?? 'lax'
            });
          },
          async remove(name: string, options: CookieOptions) {
            // Pass through path and other options for proper cookie removal
            res.cookies.delete({ name, ...options });
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
    // SECURITY: Sanitize user ID (UUIDs are safe but validate anyway)
    const sanitizedUserId = user.id.replace(/[^\w-]/g, '');
    res.headers.set('x-user-id', sanitizedUserId);

    // SECURITY FIX: Don't add email to headers - potential header injection risk
    // Email can contain newlines or special chars that break HTTP header parsing
    // If email is needed in components, fetch from user context instead
    // res.headers.set('x-user-email', user.email || ''); // REMOVED for security

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

      // SECURITY FIX: Use helper to properly clear auth cookies
      clearAuthCookies(response);

      return response;
    }

    // Student Role Access Control
    if (profile.role === 'student') {
      console.log('[Proxy] 🎓 Student detected:', user.id, 'path:', currentPath);
      console.log('[Proxy] Feature flag ENABLE_STUDENT_PORTAL:', FEATURE_FLAGS.ENABLE_STUDENT_PORTAL);

      // Check feature flag first
      if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) {
        // Feature disabled - block all students (original behavior)
        console.log('[Proxy] ❌ Student portal DISABLED - blocking student');

        if (currentPath === '/auth/login') {
          const response = NextResponse.next();
          clearAuthCookies(response);
          await supabase.auth.signOut();
          return response;
        }

        const studentBlockedResponse = NextResponse.redirect(
          new URL('/auth/login?reason=student_redirect', request.url)
        );
        clearAuthCookies(studentBlockedResponse);
        await supabase.auth.signOut();
        return studentBlockedResponse;
      } else {
        // Feature enabled - validate student lifecycle status
        console.log('[Proxy] ✅ Student portal ENABLED - validating access...');

        const validation = await StudentValidationService.validateStudentAccess(user.id);

        console.log('[Proxy] Validation result:', {
          allowed: validation.allowed,
          reason: validation.reason,
          status: validation.status,
          isGraduated: validation.isGraduated
        });

        if (!validation.allowed) {
          // Student blocked due to lifecycle status
          console.log('[Proxy] ❌ Student BLOCKED - reason:', validation.reason);

          if (currentPath === '/auth/login') {
            const response = NextResponse.next();
            clearAuthCookies(response);
            await supabase.auth.signOut();
            return response;
          }

          const blockedResponse = NextResponse.redirect(
            new URL(`/auth/login?reason=${validation.reason}`, request.url)
          );
          clearAuthCookies(blockedResponse);
          await supabase.auth.signOut();
          return blockedResponse;
        } else {
          // Student allowed - continue to requested page
          console.log('[Proxy] ✅ Student ALLOWED - continuing to:', currentPath);
          // Don't return here - let the middleware continue processing
        }
      }
    }

    // Check for disabled user accounts (applies to all users)
    if (user.user_metadata?.account_disabled === true) {
      // Account has been disabled - sign out and redirect
      const disabledResponse = NextResponse.redirect(
        new URL('/auth/login?reason=disabled', request.url)
      );

      // SECURITY FIX: Use helper to properly clear auth cookies
      clearAuthCookies(disabledResponse);

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
    // SECURITY: Parent portal routes (uses separate auth system)
    '/parent-portal/:path*',
    '/api/parent-portal/:path*',
    // Match all paths except public ones
    '/((?!_next/static|_next/image|favicon.ico|auth|icons|pwa-test.html).*)'
  ]
};
