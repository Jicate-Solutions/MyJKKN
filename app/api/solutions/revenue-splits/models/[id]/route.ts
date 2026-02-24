import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { RevenueSplitService } from '@/lib/services/solutions/revenue-split-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await RevenueSplitService.getRevenueSplitModelById(id)
  if (!result) return errorResponse('Revenue split model not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, created_at, ...safeBody } = body
  const result = await RevenueSplitService.updateRevenueSplitModel(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await RevenueSplitService.deleteRevenueSplitModel(id)
  return noContentResponse()
})
