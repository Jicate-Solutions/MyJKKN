import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ContentService } from '@/lib/services/solutions/content-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await ContentService.getDeliverableById(id)
  if (!result) return errorResponse('Deliverable not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, order_id, created_at, updated_at, revision_count, approved_by, approved_at, ...safeBody } = body
  const result = await ContentService.updateDeliverable(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await ContentService.deleteDeliverable(id)
  return noContentResponse()
})
