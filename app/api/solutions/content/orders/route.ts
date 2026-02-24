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
  const division = getStringParam(url, 'division')
  const order_type = getStringParam(url, 'order_type')
  const solution_id = getUuidParam(url, 'solution_id')

  const result = await ContentService.getOrders({
    page,
    limit,
    division: division as any,
    order_type: order_type as any,
    solution_id,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.solution_id) {
    return errorResponse('solution_id is required', 400)
  }

  const result = await ContentService.createOrder(body)
  return createdResponse(result)
})
