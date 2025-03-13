import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { corsHeaders } from '@/lib/api-keys/cors';

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

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore
    });

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7);
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

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

    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const institutionId = url.searchParams.get('institution_id');
    const degreeId = url.searchParams.get('degree_id');
    const departmentId = url.searchParams.get('department_id');
    const isActive = url.searchParams.get('isActive');

    // For Supabase RLS policies, we need to set the apikey directly in the request header
    // Since we can't directly modify the headers in the Supabase client, we'll use a workaround
    
    // Create a new Supabase client with the API key in the headers
    // This approach uses the createClient method which allows us to set global headers
    const { createClient } = await import('@supabase/supabase-js');
    
    // Get the Supabase URL and anon key from the environment
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase URL or anon key is missing');
    }
    
    // Create a custom Supabase client with the API key in the headers
    const supabaseWithApiKey = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          apikey: hashedKey
        }
      }
    });
    
    // Create a direct database connection with the API key in the header
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Build query with proper filters
    let query = supabaseWithApiKey
      .from('programs')
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
          degree_id,
          degree_name
        ),
        department:departments (
          id,
          department_code,
          department_name
        )
      `,
        { count: 'exact' }
      );

    // Apply filters
    if (search) {
      query = query.or(
        `program_id.ilike.%${search}%,program_name.ilike.%${search}%`
      );
    }

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (degreeId) {
      query = query.eq('degree_id', degreeId);
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    // Apply pagination
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: programs, error, count } = await query;

    if (error) throw error;

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    // Add the API key to the response headers to ensure it's passed to Supabase
    const responseHeaders = {
      ...corsHeaders,
      'apikey': hashedKey
    };

    return NextResponse.json({
      data: programs || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    }, { headers: responseHeaders });
  } catch (error) {
    console.error('Error fetching programs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
