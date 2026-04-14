import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrainingService } from '@/lib/services/solutions/training-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await TrainingService.getSessionById(id)
  if (!result) return errorResponse('Training session not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, program_id, created_at, updated_at, ...safeBody } = body
  const result = await TrainingService.updateSession(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await TrainingService.deleteSession(id)
  return noContentResponse()
})
