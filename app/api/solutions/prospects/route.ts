import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProspectsService } from '@/lib/services/solutions/prospects-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const search = getStringParam(url, 'search')
  const pipeline_stage = getStringParam(url, 'pipeline_stage')
  const assigned_to = getUuidParam(url, 'assigned_to')
  const source_type = getStringParam(url, 'source_type')
  const solution_type_interest = getStringParam(url, 'solution_type_interest')
  const is_active = getStringParam(url, 'is_active')
  const overdue_only = getStringParam(url, 'overdue_only')

  const result = await ProspectsService.getProspects({
    page,
    limit,
    search,
    pipeline_stage: pipeline_stage as any,
    assigned_to,
    source_type: source_type as any,
    solution_type_interest: solution_type_interest as any,
    is_active: is_active !== undefined ? is_active === 'true' : undefined,
    overdue_only: overdue_only === 'true',
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const institutionId = auth.institutionId ?? body.institution_id
  if (!institutionId) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await ProspectsService.createProspect({
    ...body,
    institution_id: institutionId,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
