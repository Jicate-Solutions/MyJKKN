import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PhasesService } from '@/lib/services/solutions/phases-service'
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
  const status = getStringParam(url, 'status')
  const solution_id = getUuidParam(url, 'solution_id')
  const owner_department_id = getUuidParam(url, 'owner_department_id')

  const result = await PhasesService.getPhases({
    institution_id: auth.institutionId ?? undefined,
    page,
    limit,
    search,
    status: status as any,
    solution_id,
    owner_department_id,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const institutionId = auth.institutionId ?? body.institution_id
  if (!institutionId) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await PhasesService.createPhase({
    ...body,
    institution_id: institutionId,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
