import { NextRequest, NextResponse , connection } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { authenticateApiKey } from '@/lib/api-keys/authenticate';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    // Authenticate — requires 'academic' module access
    const authResult = await authenticateApiKey(request, { requiredModule: 'academic' });
    if ('error' in authResult) return authResult.error;
    const { supabase } = authResult.context;

    // Get query parameters
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
    const academicYearName = url.searchParams.get('academic_year_name');
    const institutionId = url.searchParams.get('institution_id');
    const isActive = url.searchParams.get('is_active');

    // Build query - select all fields
    let query = (supabase as any)
      .from('academic_years')
      .select('*', { count: 'exact' });

    // Apply filters
    if (academicYearName) {
      query = query.eq('academic_year_name', academicYearName);
    }

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (isActive !== null && isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true');
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute query
    const { data: academicYears, error, count } = await query;

    if (error) throw error;

    // Return response with CORS headers
    return NextResponse.json(
      {
        count: count || 0,
        data: academicYears || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error fetching academic years:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
