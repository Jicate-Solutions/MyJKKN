import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!

  const result = await ProductionService.getLearnerById(id)
  if (!result) {
    return errorResponse('Learner not found', 404)
  }

  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  const { id: _id, user_id, created_at, updated_at, total_earnings, orders_completed, ...safeBody } = body

  const result = await ProductionService.updateLearner(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!

  await ProductionService.deleteLearner(id)
  return noContentResponse()
})
