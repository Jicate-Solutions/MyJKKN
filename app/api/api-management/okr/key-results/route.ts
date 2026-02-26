// app/api/api-management/okr/key-results/route.ts
// External API for OKR Key Results

import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders })
}

export const GET = withAuth(async (request: NextRequest, auth) => {
  // Get query parameters
  const url = new URL(request.url)
  const page = parseInt(url.searchParams.get('page') || '1')
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 100)
  const objectiveId = url.searchParams.get('objective_id')
  const status = url.searchParams.get('status')
  const dataSource = url.searchParams.get('data_source')

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

  // Build query — scope via objective's institution_id using inner join filter
  let query = (auth.supabase as any)
    .from('okr_key_results')
    .select(`
      *,
      objective:okr_objectives!inner(id, title, owner_id, status, institution_id)
    `, { count: 'exact' })

  // Apply institution scoping through the objective relationship
  if (institutionId) {
    query = query.eq('objective.institution_id', institutionId)
  }

  // Apply filters
  if (objectiveId) {
    query = query.eq('objective_id', objectiveId)
  }
  if (status) {
    query = query.eq('status', status)
  }
  if (dataSource) {
    query = query.eq('data_source', dataSource)
  }

  // Apply pagination
  const from = (page - 1) * limit
  query = query
    .range(from, from + limit - 1)
    .order('order_index', { ascending: true })

  const { data, error, count } = await query

  if (error) throw error

  return NextResponse.json({
    data: data || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
