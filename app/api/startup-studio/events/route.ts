import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { EventsService } from '@/lib/services/startup-studio/events-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const search = getStringParam(url, 'search')
  const is_active = getStringParam(url, 'is_active')

  const result = await EventsService.getEvents({
    page,
    limit,
    search,
    is_active: is_active !== undefined ? is_active === 'true' : undefined,
    institution_id: auth.institutionId ?? undefined,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.name) {
    return errorResponse('name is required', 400)
  }

  const result = await EventsService.createEvent(body)
  return createdResponse(result)
})
