import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ContentService } from '@/lib/services/solutions/content-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const order_id = getUuidParam(url, 'order_id')
  const status = getStringParam(url, 'status')
  const assigned_learner_id = getUuidParam(url, 'assigned_learner_id')

  const result = await ContentService.getDeliverables({
    page,
    limit,
    order_id,
    status: status as any,
    assigned_learner_id,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.order_id) {
    return errorResponse('order_id is required', 400)
  }
  if (!body.title) {
    return errorResponse('title is required', 400)
  }

  const result = await ContentService.createDeliverable(body)
  return createdResponse(result)
})
