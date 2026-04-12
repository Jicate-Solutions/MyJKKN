import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SubmissionsService } from '@/lib/services/startup-studio/submissions-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const event_id = getUuidParam(url, 'event_id')
  const status = getStringParam(url, 'status')
  const user_id = getUuidParam(url, 'user_id')
  const search = getStringParam(url, 'search')

  const result = await SubmissionsService.getSubmissions({
    page,
    limit,
    event_id,
    status: status as any,
    user_id,
    search,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.event_id || !body.user_id) {
    return errorResponse('event_id and user_id are required', 400)
  }

  const result = await SubmissionsService.createSubmission(body)
  return createdResponse(result)
})
