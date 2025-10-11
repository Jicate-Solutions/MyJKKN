import { createHash } from 'crypto';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import type { Database } from '@/types/applications';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Apply CORS headers to response
    const response = NextResponse.next();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Use service role key for API key authentication to bypass RLS
    const supabase = createServerClient<Database>(
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

    // Get application ID from route params
    const { id: applicationId } = await params;
    if (!applicationId) {
      return NextResponse.json(
        { error: 'Application ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

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

    // Update last used timestamp
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyData.id);

    // Get the user role from the API key (if available) or set to guest by default
    const userRole = keyData.metadata?.role || 'guest';

    // Debug log for role-based filtering
    console.log('Using role for filtering:', userRole);

    // Fetch the application with the given ID
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(
        `
        *,
        category:categories(id, name, description)
      `
      )
      .eq('id', applicationId)
      .single();

    // Handle errors
    if (appError) {
      if (appError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Application not found' },
          { status: 404, headers: corsHeaders }
        );
      }
      return NextResponse.json(
        { error: appError.message },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!application) {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // Check if the user has permission to access this application based on roles
    const rolesAccess = Array.isArray(application.roles_access)
      ? application.roles_access
      : [];

    // Skip role check if the API key has the admin role
    const isAdmin = userRole === 'super_admin' || userRole === 'administrator';
    if (!isAdmin && !rolesAccess.includes(userRole)) {
      return NextResponse.json(
        { error: 'You do not have permission to access this application' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Fetch subcategory if ID is provided
    let subcategory = null;
    if (application.subcategory_id) {
      const { data: subcategoryData } = await supabase
        .from('subcategories')
        .select('id, name')
        .eq('id', application.subcategory_id)
        .single();

      if (subcategoryData) {
        subcategory = subcategoryData;
      }
    }

    // Process application to ensure proper structure
    const processedApplication = {
      ...application,
      roles_access: rolesAccess,
      tags: Array.isArray(application.tags) ? application.tags : [],
      api_endpoints: Array.isArray(application.api_endpoints)
        ? application.api_endpoints
        : [],
      screenshots: Array.isArray(application.screenshots)
        ? application.screenshots
        : [],
      subcategory
    };

    return NextResponse.json(processedApplication, { headers: corsHeaders });
  } catch (error) {
    console.error(
      'Unexpected error in GET /api/api-management/applications/[id]:',
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
