import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CyclesService } from '@/lib/services/startup-studio/cycles-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const user_id = getUuidParam(url, 'user_id')
  const event_id = getUuidParam(url, 'event_id')
  const status = getStringParam(url, 'status')
  const search = getStringParam(url, 'search')

  const result = await CyclesService.getCycles({
    page,
    limit,
    user_id,
    event_id,
    status: status as any,
    search,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const userId = body.user_id || auth.user.id
  if (!userId) {
    return errorResponse('user_id is required', 400)
  }

  const result = await CyclesService.createCycle({
    user_id: userId,
    event_id: body.event_id,
    name: body.name,
  })

  return createdResponse(result)
})
