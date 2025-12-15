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
    console.log('[Staff API] 1. Auth header:', authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'API key is required in Authorization header' },
        { status: 401, headers: corsHeaders }
      );
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    const hashedKey = createHash('sha256').update(apiKey).digest('hex');
    console.log('[Staff API] 2. Hashed key:', hashedKey);

    // Verify API key
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single();

    console.log('[Staff API] 3. Key verification:', {
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
    console.log(
      '[Staff API] 4. Query params:',
      Object.fromEntries(url.searchParams)
    );

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
    let query = supabase.from('staff').select(
      `
      *,
      category:employment_categories(id, category_name),
      institution:institutions(id, name),
      department:departments(id, department_name)
      `,
      { count: 'exact' }
    );

    console.log('[Staff API] 5. Executing query...', {
      fetchAll,
      pagination: fetchAll ? 'disabled' : `page ${page}, limit ${limit}`
    });

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

    console.log('[Staff API] 6. Query result:', {
      success: !!staff,
      error: error?.message,
      total: count,
      returned: staff?.length || 0,
      fetchedAll: fetchAll,
      firstRecord: staff?.[0]
        ? {
            id: staff[0].id,
            name: `${staff[0].first_name} ${staff[0].last_name}`
          }
        : null
    });

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
