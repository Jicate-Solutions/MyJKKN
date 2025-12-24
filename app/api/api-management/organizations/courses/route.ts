import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';
import { createServerClient } from '@supabase/ssr';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    // Add CORS headers to response
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');
    console.log('1. Auth header:', authHeader);

    // Also check for x-api-key header
    const xApiKey = request.headers.get('x-api-key');

    // Also check for apikey header
    const apiKeyHeader = request.headers.get('apikey');

    // Use the first available key
    let apiKey = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else if (xApiKey) {
      apiKey = xApiKey;
    } else if (apiKeyHeader) {
      apiKey = apiKeyHeader;
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'API key is required in Authorization, x-api-key, or apikey header'
        },
        { status: 401, headers: corsHeaders }
      );
    }

    // Hash the key for verification in our code
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');
    console.log('2. Hashed key:', hashedKey);

    // Use service role key for API key authentication to bypass RLS
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          get() {
            return undefined;
          },
          set() {},
          remove() {}
        }
      }
    );

    // Set the API key in the request header for RLS policies
    const customHeaders = new Headers();
    customHeaders.set('apikey', apiKey);

    // Create a custom fetch function that includes the API key
    const customFetch = (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers || {});
      headers.set('apikey', apiKey);
      return fetch(url, { ...options, headers });
    };

    // Override the fetch method
    const originalFetch = global.fetch;
    global.fetch = customFetch as typeof fetch;

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    // Restore original fetch
    global.fetch = originalFetch;

    console.log('3. Key verification:', {
      found: !!keyData,
      error: keyError?.message,
      keyData: keyData
        ? {
            id: keyData.id,
            name: keyData.name,
            is_active: keyData.is_active,
            permissions: keyData.permissions
          }
        : null
    });

    if (keyError || !keyData) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check if key has expired
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    // Check read permission
    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    console.log('4. Query params:', Object.fromEntries(url.searchParams));

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const institution_id = url.searchParams.get('institution_id');
    const degree_id = url.searchParams.get('degree_id');
    const department_id = url.searchParams.get('department_id');
    const program_id = url.searchParams.get('program_id');
    const is_active = url.searchParams.get('is_active');

    // Override fetch again for the data queries
    global.fetch = customFetch as typeof fetch;

    // First, let's check if there are any departments at all
    const { count: totalCount, error: countError } = await supabase
      .from('courses')
      .select(
        `
        *,
        institution:institutions (
          id,
          name,
          counselling_code
        ),
        degree:degrees (
          id,
          degree_name
        ),
        department:departments (
          id,
          department_name
        ),
        program:programs (
          id,
          program_name
        )
      `,
        { count: 'exact' }
      );

    console.log('5. Total count:', totalCount, 'Error:', countError?.message);

    // Build query
    let query = (supabase as any).from('courses').select(
      `
        *,
        institution:institutions (
          id,
          name,
          counselling_code
        ),
        degree:degrees (
          id,
          degree_name
        ),
        department:departments (
          id,
          department_name
        ),
        program:programs (
          id,
          program_name
        )
      `,
      { count: 'exact' }
    );

    // Apply filters
    if (search) {
      query = query.or(
        `course_code.ilike.%${search}%,course_name.ilike.%${search}%`
      );
    }

    if (institution_id) {
      query = query.eq('institution_id', institution_id);
    }

    if (degree_id) {
      query = query.eq('degree_id', degree_id);
    }

    if (department_id) {
      query = query.eq('department_id', department_id);
    }

    if (program_id) {
      query = query.eq('program_id', program_id);
    }

    if (is_active !== null) {
      query = query.eq('is_active', is_active === 'true');
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: courses, error, count } = await query;

    // Restore original fetch
    global.fetch = originalFetch;

    console.log('6. Query result:', {
      success: !!courses,
      error: error?.message,
      count,
      firstRecord: courses?.[0]
        ? {
            id: courses[0].id,
            course_name: courses[0].course_name
          }
        : null
    });

    if (error) throw error;

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    // Return response with CORS headers directly
    return NextResponse.json(
      {
        data: courses || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching courses:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
