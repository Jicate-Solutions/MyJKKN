import { createServerClient, CookieOptions } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PROTECTED_ROUTES } from './lib/auth/protected-routes';

// Define public paths
const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/callback',
  '/auth/complete-profile',
  '/unauthorized',
  '/students/onboarding' // Add onboarding path for pending students
];

// Helper to check if path is public
const isPublicPath = (path: string) =>
  PUBLIC_PATHS.includes(path) ||
  path.startsWith('/_next') ||
  path.startsWith('/api') ||
  path.includes('favicon.ico') ||
  path === '/sw.js' ||
  path.endsWith('.js') ||
  path.endsWith('.css') ||
  path.endsWith('.png') ||
  path.endsWith('.ico') ||
  path.endsWith('.svg');

export async function middleware(request: NextRequest) {
  try {
    // Handle CORS for child-app API routes
    if (request.nextUrl.pathname.startsWith('/api/auth/child-app/')) {
      const origin = request.headers.get('origin');
      
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        return new NextResponse(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      // For actual requests, add CORS headers
      const res = NextResponse.next();
      res.headers.set('Access-Control-Allow-Origin', origin || '*');
      res.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
      res.headers.set('Access-Control-Allow-Credentials', 'true');
      
      return res;
    }

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

    // Get and verify user - this sends a request to Supabase Auth server every time
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
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

    // Fetch and verify user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return NextResponse.redirect(new URL('/unauthorized', request.url));
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

    // Student Status Logic (Task 2: High-level access control)
    if (profile.role === 'student') {
      try {
        // Fetch student record to get status
        const { data: studentData, error: studentError } = await supabase
          .from('students')
          .select('id, status, is_profile_complete')
          .eq('college_email', profile.email)
          .single();

        if (!studentError && studentData) {
          // Handle student status-based redirects
          switch (studentData.status) {
            case 'pending':
              // Redirect pending students to learner dashboard instead of onboarding
              if (
                !currentPath.startsWith('/learner') &&
                !currentPath.startsWith('/students/onboarding')
              ) {
                return NextResponse.redirect(new URL('/learner', request.url));
              }
              break;

            case 'exited':
              // Sign out and redirect to login
              const logoutResponse = NextResponse.redirect(
                new URL('/auth/login?reason=exited', request.url)
              );

              // Clear all auth cookies
              logoutResponse.cookies.delete('sb-access-token');
              logoutResponse.cookies.delete('sb-refresh-token');

              // Also sign out from Supabase
              await supabase.auth.signOut();

              return logoutResponse;

            case 'active':
            case 'inactive':
            case 'graduated':
              // These statuses are handled by fine-grained permissions (Task 3)
              // Let them through for now
              break;

            default:
              // Unknown status - treat as inactive for safety
              console.warn(`Unknown student status: ${studentData.status}`);
              break;
          }

          // Add student info to headers for downstream components
          res.headers.set('x-student-id', studentData.id);
          res.headers.set('x-student-status', studentData.status);
          res.headers.set(
            'x-student-profile-complete',
            studentData.is_profile_complete.toString()
          );
        } else {
          // Student record not found - this might be a new student
          console.warn(
            'Student profile found but no student record:',
            profile.email
          );

          // Redirect to learner dashboard instead of onboarding
          if (
            !currentPath.startsWith('/learner') &&
            !currentPath.startsWith('/students/onboarding')
          ) {
            return NextResponse.redirect(new URL('/learner', request.url));
          }
        }
      } catch (studentFetchError) {
        // Log error but don't block access - fallback to profile-based logic
        console.error('Error fetching student status:', studentFetchError);
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
    } else if (profile.role === 'student') {
      // If student is trying to access admin routes, redirect to learner dashboard
      if (
        currentPath.startsWith('/users') ||
        currentPath.startsWith('/system') ||
        currentPath.startsWith('/organizations') ||
        currentPath.startsWith('/staff') ||
        currentPath.startsWith('/admissions') ||
        currentPath.startsWith('/admin') ||
        currentPath.startsWith('/billing') ||
        currentPath.startsWith('/academic') ||
        currentPath.startsWith('/resources') ||
        currentPath.startsWith('/application-hub') ||
        currentPath.startsWith('/bug-leaderboard') ||
        currentPath.startsWith('/my-bug-reports') ||
        currentPath === '/'
      ) {
        // Redirect to learner dashboard
        return NextResponse.redirect(new URL('/learner', request.url));
      }
    } else {
      // Non-student, non-guest users (admin roles) trying to access learner routes should be redirected to admin dashboard
      if (currentPath.startsWith('/learner')) {
        return NextResponse.redirect(new URL('/', request.url));
      }
      // Admin users trying to access guest page should be redirected to dashboard
      if (currentPath.startsWith('/guest')) {
        return NextResponse.redirect(new URL('/', request.url));
      }
    }

    // Check protected routes access
    for (const [_, config] of Object.entries(PROTECTED_ROUTES)) {
      if (config.paths.some((path) => currentPath.startsWith(path))) {
        // Verify role-based access
        if (!profile.role || !config.roles.includes(profile.role)) {
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
    // Redirect to error page for critical failures
    return NextResponse.redirect(new URL('/error', request.url));
  }
}

export const config = {
  matcher: [
    // API routes for child app authentication (CORS handling)
    '/api/auth/child-app/:path*',
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
    '/learner/:path*',
    '/students/:path*',
    '/guest/:path*',
    // Match all paths except public ones
    '/((?!_next/static|_next/image|favicon.ico|auth/login|auth/callback|auth/complete-profile).*)'
  ]
};
