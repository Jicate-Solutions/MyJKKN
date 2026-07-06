import { createServerClient, CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';
import { profileCache } from './lib/auth/profile-cache';
import { routeMatcher } from './lib/auth/route-matcher';
import { FEATURE_FLAGS } from './lib/config/feature-flags';
import { StudentValidationService } from './lib/services/auth/student-validation-service';
import { PARENT_SESSION_COOKIE, verifyParentSession } from './lib/auth/parent-jwt';
import {
  SCHOOL_PORTAL_SESSION_COOKIE,
  verifySchoolPortalSession,
} from './lib/auth/school-portal-jwt';

// Parent Portal pages that are reachable WITHOUT a parent_session (the auth
// funnel). Everything else under /parent/* requires a valid parent_session JWT.
// NOTE: /api/parent/* auth is enforced in-route via resolveParentScope(). Those
// routes (like all /api/*) pass through this proxy and are force-set to
// no-store by the isPublicPath() branch in proxy() — a `public, s-maxage` cache
// is keyed by URL, not by the session cookie, so it would serve one user's data
// to another across browsers AND devices.
const PARENT_PUBLIC_PATHS = new Set([
  '/parent',
  '/parent/onboarding',
  '/parent/login',
  '/parent/register',
  '/parent/forgot',
]);

// Once authenticated, these auth-funnel pages redirect straight to the dashboard.
const PARENT_REDIRECT_WHEN_AUTHED = new Set([
  '/parent',
  '/parent/login',
  '/parent/register',
]);

async function handleParentPortal(request: NextRequest, currentPath: string) {
  const token = request.cookies.get(PARENT_SESSION_COOKIE)?.value;
  const claims = await verifyParentSession(token);

  if (claims && PARENT_REDIRECT_WHEN_AUTHED.has(currentPath)) {
    return NextResponse.redirect(new URL('/parent/dashboard', request.url));
  }

  if (!claims && !PARENT_PUBLIC_PATHS.has(currentPath)) {
    const url = new URL('/parent/login', request.url);
    url.searchParams.set('redirectedFrom', currentPath);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, must-revalidate');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return res;
}

// Schools Network HM Portal — same dual-auth shape as the parent portal:
// HMs are NOT in auth.users, so /schools-portal/* must be reachable without
// a Supabase session. The login + verify pages are unauthenticated; the
// dashboard / update-contact pages require a school_portal_session JWT.
//
// API auth for /api/schools-portal/* is enforced in-route via
// resolveHmSession() (see lib/services/schools-portal/session-guard.ts) —
// /api/* paths short-circuit isPublicPath() and don't need a per-route
// gate in this proxy.
const SCHOOL_PORTAL_PUBLIC_PATHS = new Set([
  '/schools-portal',
  '/schools-portal/login',
  '/schools-portal/verify',
]);

const SCHOOL_PORTAL_REDIRECT_WHEN_AUTHED = new Set([
  '/schools-portal',
  '/schools-portal/login',
]);

async function handleSchoolsPortal(request: NextRequest, currentPath: string) {
  const token = request.cookies.get(SCHOOL_PORTAL_SESSION_COOKIE)?.value;
  const claims = await verifySchoolPortalSession(token);

  if (claims && SCHOOL_PORTAL_REDIRECT_WHEN_AUTHED.has(currentPath)) {
    return NextResponse.redirect(
      new URL('/schools-portal/dashboard', request.url),
    );
  }

  if (!claims && !SCHOOL_PORTAL_PUBLIC_PATHS.has(currentPath)) {
    const url = new URL('/schools-portal/login', request.url);
    url.searchParams.set('redirectedFrom', currentPath);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, must-revalidate');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return res;
}

// Define public paths - optimized with Set for O(1) lookup
const PUBLIC_PATHS_SET = new Set([
  '/', // Allow root path to avoid ERR_FAILED issues
  '/auth/login',
  '/auth/callback',
  '/auth/complete-profile',
  '/auth/test-login', // Dev-only test login page for role permission testing
  '/auth/lti-login', // Feature-flagged email+password login for MathWorks LTI integration testing
  '/auth/audit-login', // Feature-flagged email+password login for the Razorpay payment-gateway audit
  '/auth/dev-login', // Dev-only magic-link exchange (gated by NEXT_PUBLIC_ENABLE_DEV_LOGIN)
  '/unauthorized',
  '/students/onboarding', // Add onboarding path for pending students
  '/billing/payment/success', // HDFC payment success callback
  '/billing/payment/failed', // HDFC payment failure callback
  '/sw.js',
  '/manifest.webmanifest',
  '/browserconfig.xml',
  '/pwa-test.html',
  '/refer', // Agent referral form — public, no login
  '/privacy', // Privacy Policy — public, required for Meta App Review
  '/terms', // Terms of Use — public, required for Meta App Review
  '/data-deletion', // Data Deletion instructions — public, required for Meta App Review
  '/meet', // Universal Booking directory — public, no login (U4)
  '/employers/submit', // CDC employer self-submit vacancy form — public, no login
  '/api/admission/leads/refer', // Agent referral API
  '/api/admission/leads/inbound' // Inbound webhook API
]);

// Public path prefixes (for dynamic routes like /apply/[slug])
const PUBLIC_PATH_PREFIXES = [
  '/apply/', // Public admission form builder pages — no login
  '/book/', // Public routed-booking pages (/book/[slug]) — no login (Path W #10)
  '/meet/', // Universal Booking personal pages (/meet/[handle]) — no login (U4)
  '/c/', // Public campaign link shortener pages — no login
  '/student-form/', // Student self-fill form via QR (token-validated server-side) — no login
  '/m/', // Family Moments gift cards (/m/[token]) — parent-facing, no login (Father's Day 2026).
  //        NOTE: deliberately NOT '/moments/' — that prefix is the AUTHENTICATED
  //        teacher/admin module (submit, campaigns) and must stay behind login.
  '/api/public/moments/', // Family Moments engagement tracking — token-keyed, no login
  '/p/', // Wellness Programs public patient page (/p/[token]) — QR-scanned, no login (token-validated server-side)
  '/api/public/health-programs/', // Wellness Programs public view tracking — token-keyed, no login
  '/api/calendar/feed/', // ICS calendar feed — token-keyed bearer secret, no login (Google Calendar polls this)
  '/verify/', // Public certificate verification (/verify/[number]) — QR-scanned by recruiters, no login. Also the LinkedIn "See credential" target. Page under app/verify/ is public-by-design but was never allowlisted (307→login bug); pde_certificates was empty so it stayed latent.
];

// Regex for static assets - single check instead of multiple endsWith
const STATIC_ASSET_PATTERN =
  /^\/(_next|icons)|\.(?:js|css|png|ico|svg|json|xml|html|woff2?)$/;

// Optimized helper to check if path is public - O(1) lookup
const isPublicPath = (path: string): boolean => {
  // Fast exact match check (O(1))
  if (PUBLIC_PATHS_SET.has(path)) return true;

  // Prefix check for dynamic public routes (e.g. /apply/[slug])
  for (const prefix of PUBLIC_PATH_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }

  // Single regex check for static assets and API routes
  if (STATIC_ASSET_PATTERN.test(path)) return true;

  // Special cases
  if (path.startsWith('/api') || path.includes('favicon.ico')) return true;

  return false;
};

// Pre-onboarding (induction-only) learners — admission-funnel statuses (enquiry,
// enquiry_submitted, reserved, admitted) — may reach ONLY these authenticated
// paths; everything else redirects to /learners/my-induction. Mirrors the
// guest/driver scoping pattern below. NOTE: /auth/* and /auth/complete-profile are
// already public (short-circuit in isPublicPath above), so they don't need listing
// here. Spec: specs/pre-onboarding-induction-access-2026-06-29.md
const INDUCTION_ONLY_EXACT_PATHS = new Set([
  '/learners/my-profile', // profile completion — the My Induction nudge target
  '/unauthorized',
  '/error'
]);
const INDUCTION_ONLY_PREFIXES = ['/learners/my-induction'];
const isInductionOnlyAllowedPath = (path: string): boolean => {
  if (INDUCTION_ONLY_EXACT_PATHS.has(path)) return true;
  for (const prefix of INDUCTION_ONLY_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + '/')) return true;
  }
  return false;
};

// Legacy drip-sequence routes relocated to /automations/ (2026-05-12).
// Keep these 301s for at least one release cycle / 90 days so external
// bookmarks and stale links resolve.
const LEGACY_CAMPAIGN_REDIRECTS: Record<string, string> = {
  '/admission/marketing/campaigns/monitoring':
    '/admission/marketing/automations/monitoring',
  '/admission/marketing/campaigns/roi':
    '/admission/marketing/automations/roi',
  '/admission/marketing/campaigns/segments':
    '/admission/marketing/automations/segments',
};

export async function proxy(request: NextRequest) {
  try {
    const currentPath = request.nextUrl.pathname;

    const legacyTarget = LEGACY_CAMPAIGN_REDIRECTS[currentPath];
    if (legacyTarget) {
      const url = request.nextUrl.clone();
      url.pathname = legacyTarget;
      return NextResponse.redirect(url, 301);
    }

    // Parent Portal — fully isolated dual-auth domain. Gate /parent/* with the
    // parent_session JWT and return early, BEFORE the staff Supabase flow runs
    // (a parent has no Supabase session and would otherwise be bounced to the
    // staff /auth/login).
    if (currentPath === '/parent' || currentPath.startsWith('/parent/')) {
      return handleParentPortal(request, currentPath);
    }

    // Schools Network HM Portal — same dual-auth shape as the parent portal.
    // HMs sign in via magic link (no Supabase session). Gate /schools-portal/*
    // with the school_portal_session JWT before the staff Supabase flow runs.
    if (
      currentPath === '/schools-portal' ||
      currentPath.startsWith('/schools-portal/')
    ) {
      return handleSchoolsPortal(request, currentPath);
    }

    // NOTE: /api/parent/* (and every other /api/*) is handled by the
    // isPublicPath() branch below, which now forces no-store for all API routes
    // — see the SECURITY comment there. No per-prefix special-casing needed.

    // Helper: inject preconnect hints to speed up Supabase and Google connections
    const addPreconnectHeaders = (response: NextResponse) => {
      response.headers.set(
        'Link',
        [
          '<https://kvizhngldtiuufknvehv.supabase.co>; rel=preconnect; crossorigin',
          '<https://accounts.google.com>; rel=preconnect',
          '<https://apis.google.com>; rel=preconnect'
        ].join(', ')
      );
      // Security headers
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'SAMEORIGIN');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      return response;
    };

    // Root path — allow CDN caching with short revalidation (was: aggressive no-store killing perf)
    if (currentPath === '/') {
      const response = NextResponse.next();
      response.headers.set(
        'Cache-Control',
        'public, s-maxage=60, stale-while-revalidate=300'
      );
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
      response.headers.set('X-App-Version', appVersion);
      return addPreconnectHeaders(response);
    }

    // Skip proxy for public paths BEFORE creating Supabase client
    if (isPublicPath(currentPath)) {
      const res = NextResponse.next();
      // SECURITY (secure-by-default): isPublicPath() returns true for ALL /api/*
      // routes — but "skip the staff auth flow" is NOT the same as "safe to cache
      // publicly". A `public, s-maxage` header is keyed by URL, not by the auth
      // cookie, so a shared browser/CDN serves one user's response to another
      // (across devices). That caused the parent-portal cross-account leak.
      // Therefore: API routes default to no-store; only non-API public paths
      // (marketing pages, static assets) get the short CDN cache. A genuinely
      // cacheable API endpoint opts in explicitly by setting its own
      // Cache-Control header in-route (e.g. /api/parent/attachment).
      if (currentPath.startsWith('/api')) {
        res.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
      } else {
        res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
      }
      const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'dev';
      res.headers.set('X-App-Version', appVersion);
      return addPreconnectHeaders(res);
    }

    const res = addPreconnectHeaders(NextResponse.next());

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
            // CRITICAL: forward Supabase's cookie options (maxAge, path,
            // sameSite, secure) verbatim. Dropping them downgrades the
            // persistent auth cookie to a session cookie on every token
            // refresh, which is why iOS PWA users were logged out on every
            // app-close. Sister code in lib/supabase/server.ts already does
            // this correctly — proxy.ts was the outlier.
            res.cookies.set({ name, value, ...options });
          },
          async remove(name: string, options: CookieOptions) {
            // Match Supabase's expected delete semantics: write an empty
            // value with maxAge: 0 carrying the same path/domain so the
            // browser actually evicts the cookie scope-correctly.
            res.cookies.set({ name, value: '', ...options, maxAge: 0 });
          }
        }
      }
    );

    // Get and verify user - this sends a request to Supabase Auth server every time.
    // Mobile networks (LTE handoffs, cell switches, weak signal) routinely produce
    // a single transient 5xx or network error here. Without a retry, that one
    // failure logs the user out. Match the profile-fetch retry pattern below
    // (single retry after 200 ms) — cheap, bounded, eliminates the largest class
    // of "logged out for no reason" mobile failures.
    let authResult = await supabase.auth.getUser();
    if (authResult.error && !authResult.data.user) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      authResult = await supabase.auth.getUser();
    }
    const {
      data: { user },
      error: userError
    } = authResult;

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
      // Cache miss - fetch from database with retry on transient failure
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('[Proxy] Profile fetch failed (attempt 1):', profileError.code, profileError.message);

        // Retry once after short delay for transient errors (timeout, network, etc.)
        await new Promise(resolve => setTimeout(resolve, 200));
        const { data: retryData, error: retryError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (retryError) {
          console.error('[Proxy] Profile fetch failed (attempt 2):', retryError.code, retryError.message);
          profileCache.invalidate(user.id);

          // FIXED: Redirect to login with error context instead of /unauthorized
          // /unauthorized is for permission issues, not transient fetch failures
          const redirectUrl = new URL('/auth/login', request.url);
          redirectUrl.searchParams.set('error', 'profile_load_failed');
          redirectUrl.searchParams.set('redirectedFrom', currentPath);
          return NextResponse.redirect(redirectUrl);
        }

        profile = retryData;
      } else {
        profile = data;
      }

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

    // Student Role Access Control
    if (profile.role === 'student') {
      console.log('[Proxy] 🎓 Student detected:', user.id, 'path:', currentPath);
      console.log('[Proxy] Feature flag ENABLE_STUDENT_PORTAL:', FEATURE_FLAGS.ENABLE_STUDENT_PORTAL);

      // LTI test student bypass — accounts matching lti.*@jkkn.ac.in are seeded by
      // scripts/create-lti-test-accounts.ts for MathWorks integration testing. They
      // must stay logged in regardless of ENABLE_STUDENT_PORTAL and lifecycle status
      // so MathWorks can reach LTI launch URLs. Removed after LTI sign-off via
      // scripts/cleanup-lti-test-accounts.ts (soft-ban + password rotate).
      const isLtiTestStudent =
        !!user.email && /^lti\..+@jkkn\.ac\.in$/.test(user.email);

      if (isLtiTestStudent) {
        console.log('[Proxy] ✅ LTI test student bypass for:', user.email);
        // Fall through to the rest of the middleware (profile-completion check,
        // role-based routing, permission check). The student portal gate is skipped.
      } else if (!FEATURE_FLAGS.ENABLE_STUDENT_PORTAL) {
        // Feature disabled - block all students (original behavior)
        console.log('[Proxy] ❌ Student portal DISABLED - blocking student');

        if (currentPath === '/auth/login') {
          const response = NextResponse.next();
          response.cookies.delete('sb-access-token');
          response.cookies.delete('sb-refresh-token');
          await supabase.auth.signOut();
          return response;
        }

        const studentBlockedResponse = NextResponse.redirect(
          new URL('/auth/login?reason=student_redirect', request.url)
        );
        studentBlockedResponse.cookies.delete('sb-access-token');
        studentBlockedResponse.cookies.delete('sb-refresh-token');
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

        if (validation.accessTier === 'induction_only') {
          // Pre-onboarding learner — RESTRICTED to the induction whitelist. They
          // are legitimately logged in (do NOT sign out); just scope them down to
          // My Induction (+ feedback) + profile completion, redirecting everything
          // else. Same shape as the guest/driver redirect below.
          if (!isInductionOnlyAllowedPath(currentPath)) {
            console.log('[Proxy] 🎓 Induction-only learner - redirecting', currentPath, '→ /learners/my-induction');
            return NextResponse.redirect(new URL('/learners/my-induction', request.url));
          }
          console.log('[Proxy] 🎓 Induction-only learner - allowing:', currentPath);
          // Whitelisted path — fall through and let the middleware continue.
        } else if (!validation.allowed) {
          // Student blocked due to lifecycle status
          console.log('[Proxy] ❌ Student BLOCKED - reason:', validation.reason);

          if (currentPath === '/auth/login') {
            const response = NextResponse.next();
            response.cookies.delete('sb-access-token');
            response.cookies.delete('sb-refresh-token');
            await supabase.auth.signOut();
            return response;
          }

          const blockedResponse = NextResponse.redirect(
            new URL(`/auth/login?reason=${validation.reason}`, request.url)
          );
          blockedResponse.cookies.delete('sb-access-token');
          blockedResponse.cookies.delete('sb-refresh-token');
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
        'hod',
        'admission',
        'registrar',
        'principal'
      ].includes(profile.role)
    ) {
      // This is a custom role - fetch permissions from custom_roles table
      const { data: customRole } = await supabase
        .from('custom_roles')
        .select('permissions')
        .eq('role_key', profile.role)
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
    '/manifest.webmanifest',
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
    '/parent/:path*',
    '/schools-portal/:path*',
    // Match all paths except public ones
    '/((?!_next/static|_next/image|favicon.ico|auth/login|auth/callback|auth/complete-profile|auth/test-login|auth/lti-login|auth/audit-login|auth/dev-login|icons|pwa-test.html).*)'
  ]
};
