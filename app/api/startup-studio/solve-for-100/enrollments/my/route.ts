import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const programId = getStringParam(url, 'program_id')

  if (!programId) {
    return errorResponse('program_id query parameter is required', 400)
  }

  const enrollment = await SF100Service.getMyEnrollment(auth.user.id, programId)

  if (!enrollment) {
    return errorResponse('No enrollment found for this user in the specified program', 404)
  }

  return successApiResponse(enrollment)
}, { requiredPermission: 'read' })
