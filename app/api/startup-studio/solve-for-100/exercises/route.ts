import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const programId = getStringParam(url, 'program_id')

  if (!programId) {
    return errorResponse('program_id is required', 400)
  }

  const status = getStringParam(url, 'status')
  const exercises = await SF100Service.listExercises(programId, { status })

  return successApiResponse(exercises)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.program_id) {
    return errorResponse('program_id is required', 400)
  }
  if (!body.title) {
    return errorResponse('title is required', 400)
  }
  if (!body.fields || !Array.isArray(body.fields) || body.fields.length === 0) {
    return errorResponse('fields must be a non-empty array', 400)
  }

  const exercise = await SF100Service.createExercise(body, auth.user.id)
  return createdResponse(exercise)
})
