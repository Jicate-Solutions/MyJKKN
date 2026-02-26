// app/api/api-management/academic/academic-years/[id]/route.ts
// External API for single Academic Year by ID

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

  // Fetch academic year by ID
  let query = (auth.supabase as any)
    .from('academic_years')
    .select('*')
    .eq('id', id)

  // Apply institution scoping
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  const { data: academicYear, error } = await query.single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Academic year not found' },
        { status: 404, headers: corsHeaders }
      )
    }
    throw error
  }

  return NextResponse.json({ data: academicYear }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
