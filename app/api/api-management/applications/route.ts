import { createHash } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  try {
    // Apply CORS headers to response
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

    // API Key type for type assertion
    type ApiKeyRow = {
      id: string;
      name: string;
      key_value: string;
      created_by: string;
      expires_at: string | null;
      last_used_at: string | null;
      is_active: boolean;
      permissions: { read: boolean; write: boolean };
      metadata?: { role?: string; description?: string; [key: string]: unknown };
      created_at: string;
      updated_at: string;
    };

    // Verify API key
    const { data: keyData, error: keyError } = (await supabase
      .from('api_keys')
      .select('*')
      .eq('key_value', hashedKey)
      .eq('is_active', true)
      .single()) as { data: ApiKeyRow | null; error: unknown };

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

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    // Get the user role from the API key (if available) or set to guest by default
    const userRole = keyData.metadata?.role || 'guest';

    // Debug log for role-based filtering

    // Get query parameters for filtering
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('search');
    const isActive = url.searchParams.get('isActive');
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const skipRoleFiltering =
      url.searchParams.get('skipRoleFiltering') === 'true';

    // Start building the query
    let query = (supabase as any).from('applications').select(
      `
        *,
        category:categories(id, name, description)
      `,
      { count: 'exact' }
    );

    // Apply filters
    if (category && category !== 'all') {
      query = query.eq('category_id', category);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Filter by roles_access to implement role-based access control
    // Only fetch applications where the role is included in roles_access
    // Skip if explicitly requested (only for admin or testing purposes)
    if (!skipRoleFiltering) {
      query = query.contains('roles_access', [userRole]);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Execute the query
    const { data: applications, error, count } = await query;

    if (error) {
      console.error('Error fetching applications:', error);
      return NextResponse.json(
        {
          error: 'Error fetching applications',
          message: error.message,
          details: error.details,
          code: error.code
        },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!applications) {
      console.warn('No applications returned but no error');
      return NextResponse.json(
        {
          data: [],
          metadata: {
            total: 0,
            page,
            limit,
            totalPages: 0
          }
        },
        { headers: corsHeaders }
      );
    }

    // Process applications and fetch subcategory information
    const processedApplications = await Promise.all(
      applications.map(async (app: any) => {
        // Fetch subcategory if ID is provided
        let subcategory = null;
        if (app.subcategory_id) {
          const { data: subcategoryData } = await supabase
            .from('subcategories')
            .select('id, name')
            .eq('id', app.subcategory_id)
            .single();

          if (subcategoryData) {
            subcategory = subcategoryData;
          }
        }

        // Create a safe copy with guaranteed fields
        return {
          ...app,
          roles_access: Array.isArray(app.roles_access) ? app.roles_access : [],
          tags: Array.isArray(app.tags) ? app.tags : [],
          api_endpoints: Array.isArray(app.api_endpoints)
            ? app.api_endpoints
            : [],
          screenshots: Array.isArray(app.screenshots) ? app.screenshots : [],
          subcategory
        };
      })
    );

    // Debug log the number of applications returned

    return NextResponse.json(
      {
        data: processedApplications,
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
    console.error(
      'Unexpected error in GET /api/api-management/applications:',
      error
    );
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', message: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}
