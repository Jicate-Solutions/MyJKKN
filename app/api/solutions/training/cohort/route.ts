import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CohortService } from '@/lib/services/solutions/cohort-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const level = getStringParam(url, 'level')
  const track = getStringParam(url, 'track')
  const department_id = getUuidParam(url, 'department_id')
  const is_active = getStringParam(url, 'is_active')
  const search = getStringParam(url, 'search')

  const result = await CohortService.getCohortMembers({
    page,
    limit,
    level,
    track: track as any,
    department_id,
    is_active: is_active !== undefined ? is_active === 'true' : undefined,
    search,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.name) {
    return errorResponse('name is required', 400)
  }

  const result = await CohortService.createCohortMember(body)
  return createdResponse(result)
})
