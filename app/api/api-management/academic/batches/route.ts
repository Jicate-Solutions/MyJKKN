// app/api/api-management/academic/batches/route.ts
// External API for Batches

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
  const batchYear = url.searchParams.get('batch_year')
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
    .from('batches')
    .select('*', { count: 'exact' })

  // Apply institution scoping
  if (institutionId) {
    query = query.eq('institution_id', institutionId)
  }

  // Apply filters
  if (batchYear) {
    query = query.eq('batch_year', batchYear)
  }
  if (isActive !== null && isActive !== undefined) {
    query = query.eq('is_active', isActive === 'true')
  }

  // Apply pagination
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to).order('created_at', { ascending: false })

  const { data: batches, error, count } = await query

  if (error) throw error

  return NextResponse.json({
    data: batches || [],
    metadata: {
      total: count || 0,
      page,
      limit,
      totalPages: count ? Math.ceil(count / limit) : 0
    }
  }, { headers: corsHeaders })
}, { allowApiKey: true, requiredPermission: 'read' })
