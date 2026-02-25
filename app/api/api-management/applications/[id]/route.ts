import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  // Get application ID from route params
  const { id: applicationId } = await context!.params!
  if (!applicationId) {
    return NextResponse.json(
      { error: 'Application ID is required' },
      { status: 400, headers: corsHeaders }
    )
  }

  // Get the user role from the auth context
  const userRole = auth.user.role || 'guest'

  // Fetch the application with the given ID
  const { data: application, error: appError } = await auth.supabase
    .from('applications')
    .select(
      `
      *,
      category:categories(id, name, description)
    `
    )
    .eq('id', applicationId)
    .single()

  // Handle errors
  if (appError) {
    if (appError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    return NextResponse.json(
      { error: appError.message },
      { status: 500, headers: corsHeaders }
    )
  }

  if (!application) {
    return NextResponse.json(
      { error: 'Application not found' },
      { status: 404, headers: corsHeaders }
    )
  }

  const appData = application as {
    id: string
    roles_access: string[] | null
    subcategory_id: string | null
    tags: string[] | null
    api_endpoints: string[] | null
    screenshots: string[] | null
    category: { id: string; name: string; description: string } | null
    [key: string]: unknown
  }

  // Check if the user has permission to access this application based on roles
  const rolesAccess = Array.isArray(appData.roles_access)
    ? appData.roles_access
    : []

  // Skip role check if the API key has the admin role
  const isAdmin = userRole === 'super_admin' || userRole === 'administrator'
  if (!isAdmin && !rolesAccess.includes(userRole)) {
    return NextResponse.json(
      { error: 'You do not have permission to access this application' },
      { status: 403, headers: corsHeaders }
    )
  }

  // Fetch subcategory if ID is provided
  let subcategory = null
  if (appData.subcategory_id) {
    const { data: subcategoryData } = await auth.supabase
      .from('subcategories')
      .select('id, name')
      .eq('id', appData.subcategory_id)
      .single()

    if (subcategoryData) {
      subcategory = subcategoryData
    }
  }

  // Process application to ensure proper structure
  const processedApplication = {
    ...appData,
    roles_access: rolesAccess,
    tags: Array.isArray(appData.tags) ? appData.tags : [],
    api_endpoints: Array.isArray(appData.api_endpoints)
      ? appData.api_endpoints
      : [],
    screenshots: Array.isArray(appData.screenshots)
      ? appData.screenshots
      : [],
    subcategory
  }

  return NextResponse.json(processedApplication, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
