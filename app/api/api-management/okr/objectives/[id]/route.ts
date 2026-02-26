// app/api/api-management/okr/objectives/[id]/route.ts
// External API for single OKR Objective by ID

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth, context) => {
  const { id } = await context!.params!
  const url = new URL(request.url)

  // Enforce institution scoping
  let institutionId: string | null = auth.institutionId
  if (auth.authMethod === 'api_key') {
    if (!institutionId) {
      return NextResponse.json(
        { error: 'API key must be scoped to an organization' },
        { status: 400, headers: corsHeaders }
      )
    }
  } else {
    // Session: allow super_admin to query specific institution
    const queryInstitutionId = url.searchParams.get('institution_id')
    if (queryInstitutionId && auth.user.role === 'super_admin') {
      institutionId = queryInstitutionId
    }
  }

  // Fetch objective with all related data
  let query = (auth.supabase as any)
    .from('okr_objectives')
    .select(`
      *,
      owner:auth.users!owner_id(id, email, raw_user_meta_data),
      parent_objective:okr_objectives!parent_objective_id(id, title, overall_progress),
      institution:institutions(id, name),
      department:departments(id, department_name),
      key_results:okr_key_results(*),
      dependencies:okr_dependencies(*),
      tasks:okr_tasks(*),
      risks:okr_risks(*)
    `)
    .eq('id', id)

  // Apply institution scoping
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  const { data, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Objective not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw error
  }

  return NextResponse.json({ data }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
