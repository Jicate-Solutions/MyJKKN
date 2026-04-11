import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { exerciseId } = await context!.params!

  const responses = await SF100Service.getExerciseResponses(exerciseId)
  return successApiResponse(responses)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { exerciseId } = await context!.params!
  const body = await request.json()

  if (!body.enrollment_id) {
    return errorResponse('enrollment_id is required', 400)
  }
  if (!body.response_data || typeof body.response_data !== 'object') {
    return errorResponse('response_data must be an object', 400)
  }

  const response = await SF100Service.submitExerciseResponse(
    exerciseId,
    body.enrollment_id,
    { response_data: body.response_data },
    auth.user.id
  )
  return createdResponse(response)
})
