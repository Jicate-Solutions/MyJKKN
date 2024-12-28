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
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    const cookieStore = cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');

    console.log('1. Auth header:', authHeader);
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


    // Check RLS policies
    console.log('4. Checking RLS policies');

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

    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const institutionId = url.searchParams.get('institution_id');
    const degreeId = url.searchParams.get('degree_id');
    const departmentId = url.searchParams.get('department_id');
    const programId = url.searchParams.get('program_id');
    const courseId = url.searchParams.get('course_id');
    const semesterId = url.searchParams.get('semester_id');
    const isActive = url.searchParams.get('is_active');

    // Build query
    let query = supabase.from('sections').select(
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
        ),
        course:courses (
          id,
          course_name
        ),
        semester:semesters (
          id,
          semester_name
        )
      `,
      { count: 'exact' }
    );

    // Apply filters
    if (search) {
      query = query.or(
        `section_code.ilike.%${search}%,section_name.ilike.%${search}%`
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

    if (programId) {
      query = query.eq('program_id', programId);
    }

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    if (semesterId) {
      query = query.eq('semester_id', semesterId);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: sections, error, count } = await query;

    if (error) throw error;

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json({
      data: sections || [],
      metadata: {
        total: count || 0,
        page,
        limit,
        totalPages: count ? Math.ceil(count / limit) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching sections:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
