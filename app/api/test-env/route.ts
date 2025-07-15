import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const envCheck = {
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NODE_ENV: process.env.NODE_ENV,
      // Add production-specific checks
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      deployment: process.env.VERCEL ? 'vercel' : 'other'
    };

    // Test Supabase connection
    let connectionTest: { success: boolean; error: string | null } = {
      success: false,
      error: null
    };
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      // Simple query to test connection
      const { data, error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);

      connectionTest = {
        success: !error,
        error: error?.message || null
      };
    } catch (testError) {
      connectionTest = {
        success: false,
        error: testError instanceof Error ? testError.message : 'Unknown error'
      };
    }

    return NextResponse.json({
      message: 'Environment variables check',
      env: envCheck,
      supabaseUrlLength: process.env.NEXT_PUBLIC_SUPABASE_URL?.length || 0,
      serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0,
      connectionTest,
      timestamp: new Date().toISOString(),
      headers: {
        userAgent: request.headers.get('user-agent'),
        host: request.headers.get('host'),
        origin: request.headers.get('origin')
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to check environment variables',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
