import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { exerciseId } = await context!.params!
  const exercise = await SF100Service.getExercise(exerciseId)

  if (!exercise) {
    return errorResponse('Exercise not found', 404)
  }

  return successApiResponse(exercise)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { exerciseId } = await context!.params!
  const body = await request.json()

  const exercise = await SF100Service.updateExercise(exerciseId, body)
  return successApiResponse(exercise)
})
