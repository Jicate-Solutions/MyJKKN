import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id: staffId } = await context!.params!

  if (!staffId) {
    return NextResponse.json(
      { error: 'Staff ID is required' },
      { status: 400, headers: corsHeaders }
    )
  }

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

  // Query for the specific staff member
  let query = auth.supabase
    .from('staff')
    .select(
      `
      *,
      category:employment_categories(id, category_name),
      institution:institutions(id, name),
      department:departments(id, department_name)
      `
    )
    .eq('id', staffId)

  // Enforce institution scoping on single-resource fetch
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  const { data: staff, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Staff not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw error
  }

  return NextResponse.json({ data: staff }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
