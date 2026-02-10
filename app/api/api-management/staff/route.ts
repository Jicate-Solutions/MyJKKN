import { createServerClient } from '@supabase/ssr';
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

    // Get API key from Authorization header
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
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

    // Check if client wants all records without pagination
    // Usage: ?all=true to fetch all staff records
    const fetchAll = url.searchParams.get('all') === 'true';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const search = url.searchParams.get('search');
    const institutionId = url.searchParams.get('institution_id');
    const departmentId = url.searchParams.get('department_id');
    const categoryId = url.searchParams.get('category_id');
    const isActive = url.searchParams.get('is_active');

    // Build query
    let query = (supabase as any).from('staff').select(
      `
      *,
      category:employment_categories(id, category_name),
      institution:institutions(id, name),
      department:departments(id, department_name)
      `,
      { count: 'exact' }
    );

    // Apply filters
    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,staff_id.ilike.%${search}%`
      );
    }

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    }

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    // Apply pagination only if not fetching all records
    if (!fetchAll) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    // Always apply ordering
    query = query.order('created_at', { ascending: false });

    // Execute query
    const { data: staff, error, count } = await query;

    if (error) throw error;

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    return NextResponse.json(
      {
        data: staff || [],
        metadata: fetchAll
          ? {
              total: count || 0,
              all: true,
              returned: staff?.length || 0
            }
          : {
              total: count || 0,
              page,
              limit,
              totalPages: count ? Math.ceil(count / limit) : 0,
              returned: staff?.length || 0
            }
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('[Staff API] Error fetching staff:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
