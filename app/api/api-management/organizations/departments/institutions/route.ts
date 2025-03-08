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
    const institutionId = url.searchParams.get('institution_id');
    const isActive = url.searchParams.get('isActive');

    // First, get all institutions
    let institutionsQuery = supabase
      .from('institutions')
      .select('id, name, counselling_code');

    if (institutionId) {
      institutionsQuery = institutionsQuery.eq('id', institutionId);
    }

    const { data: institutions, error: institutionsError } =
      await institutionsQuery;

    if (institutionsError) throw institutionsError;

    // For each institution, get its departments
    const result = await Promise.all(
      institutions.map(async (institution) => {
        let departmentsQuery = supabase
          .from('departments')
          .select('id, department_code, department_name, is_active')
          .eq('institution_id', institution.id);

        if (isActive !== null) {
          departmentsQuery = departmentsQuery.eq(
            'is_active',
            isActive === 'true'
          );
        }

        const { data: departments, error: departmentsError } =
          await departmentsQuery;

        if (departmentsError) throw departmentsError;

        return {
          institution: {
            id: institution.id,
            name: institution.name,
            counselling_code: institution.counselling_code
          },
          departments: departments || []
        };
      })
    );

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json({
      data: result,
      metadata: {
        total: result.length,
        institutions_count: institutions.length,
        departments_count: result.reduce(
          (acc, item) => acc + item.departments.length,
          0
        )
      }
    });
  } catch (error) {
    console.error('Error fetching institutions and departments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
