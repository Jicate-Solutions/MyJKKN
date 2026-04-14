import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuildersService } from '@/lib/services/solutions/builders-service'
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
  const department_id = getUuidParam(url, 'department_id')
  const has_skill = getStringParam(url, 'has_skill')
  const is_active_raw = getStringParam(url, 'is_active')
  const is_active = is_active_raw !== undefined ? is_active_raw === 'true' : undefined

  const result = await BuildersService.getBuilders({
    institution_id: auth.institutionId ?? undefined,
    page,
    limit,
    search,
    department_id,
    has_skill,
    is_active,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const institutionId = auth.institutionId ?? body.institution_id
  if (!institutionId) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await BuildersService.createBuilder({
    ...body,
    institution_id: institutionId,
  })

  return createdResponse(result)
})
