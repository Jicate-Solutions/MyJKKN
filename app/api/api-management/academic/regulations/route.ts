// app/api/api-management/academic/regulations/route.ts
// External API for Regulations

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200)
  const regulationYear = url.searchParams.get('regulation_year')
  const isActive = url.searchParams.get('is_active')

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

  // Build query
  let query = (auth.supabase as any)
    .from('regulations')
    .select('*', { count: 'exact' })

  // Apply institution scoping
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  // Apply filters
  if (regulationYear) {
    query = query.eq('regulation_year', regulationYear)
  }
  if (isActive !== null && isActive !== undefined) {
    query = query.eq('is_active', isActive === 'true')
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  const { data: regulations, error, count } = await query

  if (error) throw error

  return NextResponse.json({
    data: regulations || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
