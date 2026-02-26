import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // ── Institution scoping ──────────────────────────────────────
  let institutionId: string | null = auth.institutionId
  if (auth.authMethod === 'api_key') {
    if (!institutionId) {
      return NextResponse.json(
        { error: 'API key must be scoped to an organization' },
        { status: 400, headers: corsHeaders }
      )
    }
  } else {
    // Session auth: allow super_admin to query specific institution
    const url = new URL(request.url)
    const queryInstitutionId = url.searchParams.get('institution_id')
    if (queryInstitutionId && auth.user.role === 'super_admin') {
      institutionId = queryInstitutionId
    }
  }

  // Get the user role from the auth context
  const userRole = auth.user.role || 'guest'

  // Get query parameters for filtering
  const url = new URL(request.url)
  const category = url.searchParams.get('category')
  const search = url.searchParams.get('search')
  const isActive = url.searchParams.get('isActive')
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = parseInt(url.searchParams.get('limit') || '10')
  const skipRoleFiltering =
    url.searchParams.get('skipRoleFiltering') === 'true'

  // Start building the query
  let query = (auth.supabase as any).from('applications').select(
    `
      *,
      category:categories(id, name, description)
    `,
    { count: 'exact' }
  )

  // Apply institution scoping
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  // Apply filters
  if (category && category !== 'all') {
    query = query.eq('category_id', category)
  }

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true')
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
  }

  // Filter by roles_access to implement role-based access control
  // Only fetch applications where the role is included in roles_access
  // Skip if explicitly requested (only for admin or testing purposes)
  if (!skipRoleFiltering) {
    query = query.contains('roles_access', [userRole])
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  // Execute the query
  const { data: applications, error, count } = await query

  if (error) {
    console.error('Error fetching applications:', error)
    return NextResponse.json(
      {
        error: 'Error fetching applications',
        message: error.message,
        details: error.details,
        code: error.code
      },
      { status: 500, headers: corsHeaders }
    )
  }

  if (!applications) {
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
    )
  }

  // Process applications and fetch subcategory information
  const processedApplications = await Promise.all(
    applications.map(async (app: any) => {
      // Fetch subcategory if ID is provided
      let subcategory = null
      if (app.subcategory_id) {
        const { data: subcategoryData } = await auth.supabase
          .from('subcategories')
          .select('id, name')
          .eq('id', app.subcategory_id)
          .single()

        if (subcategoryData) {
          subcategory = subcategoryData
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
      }
    })
  )

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
  )
}, { allowApiKey: true, requiredPermission: 'read' })
