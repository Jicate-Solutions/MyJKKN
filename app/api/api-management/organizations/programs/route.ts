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
    console.log('Programs API request received:', request.url);
    console.log(
      'Request headers:',
      Object.fromEntries(request.headers.entries())
    );

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({
      cookies: () => cookieStore
    });

    const authHeader = request.headers.get('authorization');
    console.log('Authorization header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
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
        { status: 401, headers: corsHeaders }
      );
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'API key has expired' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (!keyData.permissions?.read) {
      return NextResponse.json(
        { error: 'API key does not have read permission' },
        { status: 403, headers: corsHeaders }
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

    let query = supabase.from('programs').select(
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

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    query = query.range(from, to).order('created_at', { ascending: false });

    const { data: programs, error, count } = await query;

    console.log('Programs query result:', {
      count,
      error: error?.message,
      programsCount: programs?.length || 0
    });

    if (error) {
      console.error('Error fetching programs:', error);
      throw error;
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
        ...corsHeaders,
        'Cache-Control': 'no-store, max-age=0'
      }
    });
  } catch (error) {
    console.error('Error in programs endpoint:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}
