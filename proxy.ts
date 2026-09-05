import { createServerClient, CookieOptions } from '@supabase/ssr';
import type { AuthError } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';
import { profileCache } from './lib/auth/profile-cache';
import {
  tokenValidationCache,
  type VerifiedTokenUser
} from './lib/auth/token-validation-cache';
import { routeMatcher } from './lib/auth/route-matcher';
import { routeAllowedByHandover } from './lib/auth/handover-route-access';
import { FEATURE_FLAGS } from './lib/config/feature-flags';
import { StudentValidationService } from './lib/services/auth/student-validation-service';
import { isInductionOnlyAllowedPath } from './lib/constants/induction-access';
import { PARENT_SESSION_COOKIE, verifyParentSession } from './lib/auth/parent-jwt';
import {
  SCHOOL_PORTAL_SESSION_COOKIE,
  verifySchoolPortalSession,
} from './lib/auth/school-portal-jwt';
import {
  EXTERNAL_SESSION_COOKIE,
  verifyExternalSession,
} from './lib/auth/external-jwt';

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
    // Preserve the query string so deep links survive the login roundtrip
    url.searchParams.set('redirectedFrom', currentPath + request.nextUrl.search);
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
    // Preserve the query string so deep links survive the login roundtrip
    url.searchParams.set('redirectedFrom', currentPath + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, must-revalidate');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return res;
}

// SF100 External Mentor/Investor Portal — same isolated dual-auth shape as the
// parent portal. External mentors/investors are NOT in auth.users, so /external/*
// must be reachable without a Supabase session. The login page is unauthenticated;
// everything else under /external/* requires an sf100_external_session JWT.
// API auth for /api/startup-studio/external/* is enforced in-route via
// getExternalSession(); /api/* short-circuits isPublicPath() and needs no gate here.
const EXTERNAL_PORTAL_PUBLIC_PATHS = new Set(['/external', '/external/login']);
const EXTERNAL_PORTAL_REDIRECT_WHEN_AUTHED = new Set(['/external/login']);

async function handleExternalPortal(request: NextRequest, currentPath: string) {
  const token = request.cookies.get(EXTERNAL_SESSION_COOKIE)?.value;
  const claims = await verifyExternalSession(token);

  if (claims && EXTERNAL_PORTAL_REDIRECT_WHEN_AUTHED.has(currentPath)) {
    return NextResponse.redirect(new URL('/external', request.url));
  }

  if (!claims && !EXTERNAL_PORTAL_PUBLIC_PATHS.has(currentPath)) {
    const url = new URL('/external/login', request.url);
    // Preserve the query string so deep links survive the login roundtrip
    url.searchParams.set('redirectedFrom', currentPath + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  res.headers.set('Cache-Control', 'no-store, must-revalidate');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  return res;
}

/**
 * Where an UNAUTHENTICATED visitor should be sent to sign in.
 *
 * /auth/login is Google OAuth only. A course participant has no Google account
 * — they sign in with a JKKN ID and a password — so sending them there is a
 * dead end: no field they can fill, and no hint that another page exists.
 *
 * Keyed on the PATH rather than the person, because by definition there is no
 * session to read a role from at this point. /my-courses is the participant
 * portal, so anyone arriving there without a session is one.
 *
 * Mirrors the per-portal login redirects above (parent, schools-portal,
 * external), which each route to their own sign-in page for the same reason.
 */
function loginUrlFor(currentPath: string, request: NextRequest): URL {
  return new URL(
    currentPath.startsWith('/my-courses') ? '/auth/participant-login' : '/auth/login',
    request.url,
  );
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
  '/auth/participant-login', // JKKN ID + password sign-in for EXTERNAL COURSE
  //        PARTICIPANTS. Not dev-only and not feature-flagged, unlike the three
  //        above: /auth/login is Google OAuth only, and someone who applied to a
  //        paid course from the public site has no Google account and usually no
  //        email, so this is their ONLY way in.
  '/api/auth/participant-login', // The POST that page submits to. Listed as an
  //        EXACT path rather than an '/api/auth/' prefix, which would
  //        unauthenticate every future route added under that folder. It must be
  //        public because the caller has no session yet — that is what it is for.
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
  '/programmes', // Public programme catalogue — the page that answers "what is on
  //                offer?" for somebody who was never sent a link. Lives under
  //                app/(public)/programmes/. Being in that route group is NOT what
  //                makes a page reachable — this allowlist is, and '/verify/' and
  //                '/r/' below each shipped 307ing to login by omitting it. Caught
  //                here before merge by fetching the URL with no session.
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
  '/proof/', // Verified Skills Record verify-links (/proof/[token]) — employer-facing, no login; token-validated server-side (fn_vsr_shared_record), learner-revocable.
  '/r/', // Routing forms (/r/[slug]) — a visitor answers one question and is sent
  //        to the right booking link. Public by definition: the whole point is that
  //        somebody with no account can use it. Lives under app/(public)/r/[slug]/
  //        and was never allowlisted, so it 307'd to login — exactly the failure
  //        already recorded against '/verify/' above. It stayed latent because
  //        routing_forms held zero rows until 2026-08-05; the first form ever
  //        created surfaced it within the hour.
  '/embed/', // Embeddable booking widget (/embed/[handle]) — same story. An embed
  //        that demands a login is not an embed: it is loaded in an iframe on
  //        somebody else's website, where the visitor has no JKKN session at all.
  '/course/', // PUBLIC course landing + apply (/course/[slug], /course/[slug]/apply)
  //        for the paid-courses module. External participants have no JKKN
  //        account by definition — that is the whole point of the module.
  //
  //        THE TRAILING SLASH IS LOAD-BEARING. isPublicPath matches with
  //        startsWith, so '/course' without it would also match '/courses' and
  //        '/courses/[id]' — the AUTHENTICATED admin console — and make the
  //        entire module public. Singular here, plural behind login. Do not
  //        "tidy" this.
  //
  //        The design spec originally specified '/learn/[slug]' for these pages
  //        and was corrected on 2026-08-17: app/(routes)/learn/ is the
  //        authenticated Foundation module (16 routes — profile, badges,
  //        leaderboard, channels, quests, assessments, certificates), so
  //        allow-listing '/learn/' would have unauthenticated all of them.
  //        Never add it.
  '/api/public/courses/', // Service-role read + apply for the pages above. The
  //        course tables REVOKE from anon, so these routes are the only public
  //        path to that data and they project columns explicitly — no tenant ids
  //        reach the browser.
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
// enquiry_submitted, reserved, admitted) — may reach ONLY the allowlisted
// authenticated paths; everything else redirects to /learners/my-induction.
// Mirrors the guest/driver scoping pattern below. NOTE: /auth/* and
// /auth/complete-profile are already public (short-circuit in isPublicPath
// above), so they don't need listing.
//
// The allowlist itself lives in lib/constants/induction-access.ts alongside the
// sidebar's copy, so the gate and the nav can't drift apart.
// Spec: specs/pre-onboarding-induction-access-2026-06-29.md

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

    // SF100 External Mentor/Investor Portal — same isolated dual-auth shape.
    // External mentors/investors have no Supabase session; gate /external/* with
    // the sf100_external_session JWT before the staff Supabase flow runs.
    if (currentPath === '/external' || currentPath.startsWith('/external/')) {
      return handleExternalPortal(request, currentPath);
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

    // Get and verify user. This historically sent a request to the Supabase
    // Auth server (/auth/v1/user) on EVERY authenticated document request — a
    // network round trip that set the TTFB floor. It is now amortised through a
    // short-TTL in-memory per-token validation cache
    // (lib/auth/token-validation-cache.ts): the FIRST sight of an access token
    // still performs the real network validation below; subsequent requests
    // bearing the SAME token reuse the verified verdict until the cache TTL
    // (60s) or the token's own exp claim, whichever comes first. Expired or
    // undecodable tokens are never served from cache, so they fall through to
    // the original getUser() path — the expired→refresh flow is unchanged.
    //
    // getSession() here is a LOCAL cookie read (no network) for a valid,
    // unexpired session; when the token is expired supabase-js refreshes it
    // exactly as getUser() would have.
    const {
      data: { session }
    } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? null;

    let user: VerifiedTokenUser | null = accessToken
      ? await tokenValidationCache.get(accessToken)
      : null;
    let userError: AuthError | null = null;

    if (!user) {
      // Cache miss (or no token) — real network validation, keeping the
      // original mobile-transient retry: LTE handoffs, cell switches and weak
      // signal routinely produce a single transient 5xx or network error here,
      // and without a retry that one failure logs the user out. Single retry
      // after 200 ms — cheap, bounded (matches the profile-fetch retry below).
      let authResult = await supabase.auth.getUser();
      if (authResult.error && !authResult.data.user) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        authResult = await supabase.auth.getUser();
      }
      user = authResult.data.user;
      userError = authResult.error;

      // Only SUCCESSFUL validations are cached — failures are never cached,
      // not even briefly (fail-closed; see token-validation-cache.ts).
      if (accessToken && user && !userError) {
        await tokenValidationCache.set(accessToken, user);
      }
    }

    if (userError) {
      // FIXED: Clear stale profile cache on auth error to prevent stuck loading states
      if (user?.id) {
        profileCache.invalidate(user.id);
      }
      // This branch is the COMMON logged-out case (no session cookie → getUser()
      // errors with "Auth session missing"), so it must preserve the destination
      // too — otherwise every deep link from a fresh browser lands on the bare
      // login page and the user is dumped on /dashboard after signing in.
      const errRedirectUrl = loginUrlFor(currentPath, request);
      errRedirectUrl.searchParams.set('redirectedFrom', currentPath + request.nextUrl.search);
      return NextResponse.redirect(errRedirectUrl);
    }

    if (!user) {
      const redirectUrl = loginUrlFor(currentPath, request);
      // Preserve the query string so deep links survive the login roundtrip
      redirectUrl.searchParams.set('redirectedFrom', currentPath + request.nextUrl.search);
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
          // Preserve the query string so deep links survive the login roundtrip
          redirectUrl.searchParams.set('redirectedFrom', currentPath + request.nextUrl.search);
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

    // ── Calendar-connect lock (Director decision 2026-08-18) ──────────────
    // 16 review meetings could not be scheduled because the people in them had
    // never connected Google Calendar; the daily bell nudge had already fired on
    // all 16 without effect. Anyone holding a booking page must now connect.
    //
    // `calendar_lock_active` is a CACHED VERDICT written by fn_calendar_lock_sweep
    // — the rule itself (scope, 3-day grace, 3-failure escape hatch) lives in SQL.
    // `profile` is already fetched with select('*'), so reading it here costs
    // nothing extra and NO policy lookup happens on the request path. Turning the
    // master switch off clears these flags in the same transaction, so OFF takes
    // effect on the very next request rather than the next cron tick.
    //
    // The allow-list is what stops this becoming a redirect loop: the lock screen
    // itself, the Google OAuth round-trip that CLEARS the lock, the availability
    // page the nudge has pointed at for weeks, and every auth path so a locked
    // person can always still sign out.
    if (
      (profile as { calendar_lock_active?: boolean }).calendar_lock_active === true &&
      !currentPath.startsWith('/auth/connect-calendar') &&
      !currentPath.startsWith('/api/integrations/google-calendar') &&
      !currentPath.startsWith('/meetings/availability') &&
      !currentPath.startsWith('/auth/') &&
      !currentPath.startsWith('/api/auth') &&
      !currentPath.startsWith('/unauthorized')
    ) {
      const lockUrl = new URL('/auth/connect-calendar', request.url);
      // Where they were headed, so the screen can send them back on success.
      lockUrl.searchParams.set('redirectedFrom', currentPath + request.nextUrl.search);
      return NextResponse.redirect(lockUrl);
    }

    // Role-based routing
    // ── external course participants ─────────────────────────────────────
    // Same shape as the guest and driver confinements below, and for the same
    // reason: this person holds exactly ONE permission key,
    // courses.participant.self. Every admin route would render an empty shell
    // or bounce them to /unauthorized, so send them to the one page that is
    // theirs. The migration that created this role says as much — "confined to
    // the /my-courses portal".
    //
    // Checked on is_external_participant rather than the role string, because
    // the role is editable in Role Management and the flag is the hard
    // discriminator the schema added for exactly this decision.
    if ((profile as { is_external_participant?: boolean }).is_external_participant === true) {
      if (
        !currentPath.startsWith('/my-courses') &&
        !currentPath.startsWith('/auth') &&
        !currentPath.startsWith('/api/auth') &&
        // The portal's own payment endpoints. Without these the confinement
        // 307s the participant's fetch to /my-courses, and Razorpay checkout
        // fails with an HTML redirect where it expected JSON — a silent break
        // that looks like a gateway fault. Narrow on purpose: only /payments,
        // not the whole /api/courses tree, which is the admin console's.
        !currentPath.startsWith('/api/courses/payments')
      ) {
        return NextResponse.redirect(new URL('/my-courses', request.url));
      }
    } else if (profile.role === 'guest') {
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
      // ── FIFTH LAYER — Director's Desk handovers ──────────────────────────
      // specs/director-desk/SPEC.md counts four layers a handover unlocks
      // (page gate / RLS / RPC / API route). This middleware is the fifth and
      // it runs FIRST, so until now a handover never reached any of them: the
      // check above reads custom_roles.permissions for profiles.role alone and
      // redirected the receiver before the page rendered.
      //
      // Reached ONLY here — after the role-derived check has already decided
      // to redirect. A user who holds this page by role does no extra work.
      //
      // Fails closed on error, on timeout (300 ms ceiling), and on the state
      // that is true in production today: the spine migration is unapplied, so
      // fn_my_handover_permissions() does not exist and this changes nothing.
      // See lib/auth/handover-route-access.ts.
      const grantedByHandover = await routeAllowedByHandover(
        supabase,
        user.id,
        currentPath
      );

      if (!grantedByHandover) {
        return NextResponse.redirect(new URL('/unauthorized', request.url));
      }

      // Diagnostic only — lets an operator (and the persona test) see WHY a
      // request that the role matrix denies was nonetheless served.
      res.headers.set('x-access-via', 'director-handover');
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
    '/((?!_next/static|_next/image|favicon.ico|auth/login|auth/callback|auth/complete-profile|auth/test-login|auth/lti-login|auth/audit-login|auth/dev-login|auth/participant-login|icons|pwa-test.html).*)'
  ]
};
