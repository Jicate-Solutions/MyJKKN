import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

// Enhanced OPTIONS handler for CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  // Log the origin of the request
  console.log(
    'CORS preflight request from origin:',
    request.headers.get('origin')
  );

  // Return a response with CORS headers
  return new NextResponse(null, {
    status: 204, // No content
    headers: {
      ...corsHeaders,
      'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
      'Access-Control-Max-Age': '86400' // 24 hours
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    // Get the origin from the request headers
    const origin = request.headers.get('origin') || '*';
    console.log('Programs API request received from origin:', origin);
    console.log('Programs API request URL:', request.url);
    console.log(
      'Request headers:',
      Object.fromEntries(request.headers.entries())
    );

    // Create enhanced CORS headers with the specific origin
    const enhancedCorsHeaders = {
      ...corsHeaders,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true'
    };

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore
    });

    const authHeader = request.headers.get('authorization');
    console.log('Authorization header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: enhancedCorsHeaders }
      );
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');
    console.log('Hashed API key:', hashedKey.substring(0, 10) + '...');

    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    console.log('API key verification:', {
      found: !!keyData,
      error: keyError?.message,
      permissions: keyData?.permissions
    });

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: enhancedCorsHeaders }
      );
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: enhancedCorsHeaders }
      );
    }

    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: enhancedCorsHeaders }
      );
    }

    const url = new URL(request.url);

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const institutionId = url.searchParams.get('institution_id');
    const degreeId = url.searchParams.get('degree_id');
    const departmentId = url.searchParams.get('department_id');
    const isActive = url.searchParams.get('isActive');

    console.log('Query parameters:', {
      page,
      limit,
      search,
      institutionId,
      degreeId,
      departmentId,
      isActive
    });

    const { count: totalCount, error: countError } = await supabase
      .from('programs')
      .select('*', { count: 'exact', head: true });

    console.log('Total programs count (without filters):', totalCount);

    if (countError) {
      console.error('Error counting programs:', countError);
    }

    // Set the API key as a request header for RLS policies
    const {
      data: programs,
      error,
      count
    } = await supabase.rpc('get_programs', {
      p_page: page,
      p_limit: limit,
      p_search: search || null,
      p_institution_id: institutionId || null,
      p_degree_id: degreeId || null,
      p_department_id: departmentId || null,
      p_is_active:
        isActive === 'true' ? true : isActive === 'false' ? false : null
    });

    console.log('Programs query result:', {
      count,
      error: error?.message,
      programsCount: programs?.length || 0
    });

    if (error) {
      console.error('Error fetching programs:', error);
      return NextResponse.json(
        { error: error.message || 'Error fetching programs' },
        { status: 500, headers: enhancedCorsHeaders }
      );
    }

    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    const response = {
      data: programs || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    };

    console.log('Sending response with CORS headers');

    return NextResponse.json(response, {
      headers: {
        ...enhancedCorsHeaders,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    console.error('Error in programs endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Access-Control-Allow-Origin': request.headers.get('origin') || '*',
          'Access-Control-Allow-Credentials': 'true'
        }
      }
    );
  }
}
