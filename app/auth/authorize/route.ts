import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // This route handles OAuth-style authorization requests from child apps
  // It redirects to the login page with the same parameters
  
  const searchParams = request.nextUrl.searchParams;
  const origin = request.nextUrl.origin;
  
  // Build the redirect URL to the login page with all parameters
  const loginUrl = new URL('/auth/login', origin);
  
  // Copy all search parameters to the login URL
  searchParams.forEach((value, key) => {
    loginUrl.searchParams.append(key, value);
  });
  
  // Redirect to the login page
  return NextResponse.redirect(loginUrl);
}