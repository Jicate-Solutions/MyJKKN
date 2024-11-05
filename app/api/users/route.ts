// app/api/users/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { validateApiKey, createApiResponse } from '@/lib/api/api-middleware';

export async function GET(request: NextRequest) {
  try {
    // Validate API key
    const validation = await validateApiKey(request);

    if ('error' in validation) {
      return NextResponse.json(createApiResponse(null, validation.error), {
        status: validation.status
      });
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select(
        `
        id,
        email,
        full_name,
        department,
        role,
        created_at,
        updated_at
      `
      )
      .eq('id', validation.userId)
      .single();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return NextResponse.json(
        createApiResponse(null, 'Failed to fetch user profile'),
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json(
        createApiResponse(null, 'User profile not found'),
        { status: 404 }
      );
    }

    return NextResponse.json(createApiResponse(profile), {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(createApiResponse(null, 'Internal server error'), {
      status: 500
    });
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
      'Access-Control-Max-Age': '86400'
    }
  });
}
