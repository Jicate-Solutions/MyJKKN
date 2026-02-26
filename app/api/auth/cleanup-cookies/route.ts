// app/api/auth/cleanup-cookies/route.ts
// API endpoint to clear authentication cookies and fix HTTP 431 errors

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json(
      {
        success: true,
        message: 'Authentication cookies cleared successfully'
      },
      { status: 200 }
    );

    // Clear all Supabase auth cookies
    const cookiesToClear = [
      'sb-access-token',
      'sb-refresh-token',
      'sb-auth-token',
      'supabase-auth-token',
      'sb-zwiasdpodeirxnybwvuw-auth-token', // Project-specific cookie
      'sb-zwiasdpodeirxnybwvuw-auth-token-code-verifier'
    ];

    cookiesToClear.forEach((cookieName) => {
      response.cookies.delete(cookieName);

      // Also try deleting with different paths
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/'
      });

      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/auth'
      });
    });

    // Also clear cookies from request headers
    const allCookies = request.cookies.getAll();
    allCookies.forEach((cookie) => {
      if (
        cookie.name.startsWith('sb-') ||
        cookie.name.includes('auth-token') ||
        cookie.name.includes('supabase')
      ) {
        response.cookies.delete(cookie.name);
      }
    });

    return response;
  } catch (error) {
    console.error('[API] Cookie cleanup failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to clear cookies'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const allCookies = request.cookies.getAll();
    const authCookies = allCookies.filter(
      (cookie) =>
        cookie.name.startsWith('sb-') ||
        cookie.name.includes('auth-token') ||
        cookie.name.includes('supabase')
    );

    // Calculate total size
    let totalSize = 0;
    const cookieDetails = authCookies.map((cookie) => {
      const size = new Blob([cookie.value]).size;
      totalSize += size;
      return {
        name: cookie.name,
        size,
        sizeKB: (size / 1024).toFixed(2),
        exceedsLimit: size > 4000
      };
    });

    return NextResponse.json({
      totalCookies: authCookies.length,
      totalSize,
      totalSizeKB: (totalSize / 1024).toFixed(2),
      exceedsLimit: totalSize > 150000 || cookieDetails.some((c) => c.exceedsLimit),
      cookies: cookieDetails.sort((a, b) => b.size - a.size)
    });
  } catch (error) {
    console.error('[API] Cookie diagnostic failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze cookies'
      },
      { status: 500 }
    );
  }
}
