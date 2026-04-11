import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { exerciseId, enrollmentId } = await context!.params!

  const response = await SF100Service.getTeamExerciseResponse(exerciseId, enrollmentId)

  if (!response) {
    return errorResponse('Response not found', 404)
  }

  return successApiResponse(response)
}, { requiredPermission: 'read' })
