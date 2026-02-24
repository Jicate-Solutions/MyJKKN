import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MouService } from '@/lib/services/solutions/mou-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const status = getStringParam(url, 'status')
  const solution_id = getUuidParam(url, 'solution_id')

  const result = await MouService.list({
    page,
    limit,
    status: status as any,
    solution_id,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!auth.institutionId && !body.institution_id) {
    return errorResponse('institution_id is required', 400)
  }

  const result = await MouService.create({
    ...body,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
