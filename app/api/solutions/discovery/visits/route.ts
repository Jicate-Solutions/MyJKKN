import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DiscoveryService } from '@/lib/services/solutions/discovery-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getDateRangeParams } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const { dateFrom, dateTo } = getDateRangeParams(url)
  const client_id = getStringParam(url, 'client_id')
  const solution_id = getStringParam(url, 'solution_id')
  const department_id = getStringParam(url, 'department_id')

  const result = await DiscoveryService.getDiscoveryVisits({
    page,
    limit,
    client_id,
    solution_id,
    department_id,
    date_from: dateFrom,
    date_to: dateTo,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!auth.institutionId && !body.institution_id) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await DiscoveryService.createDiscoveryVisit({
    ...body,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
