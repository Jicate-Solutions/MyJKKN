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

  // Return null (not 404) when not enrolled — the UI distinguishes "not enrolled"
  // from "failed to load" based on whether data is null vs error thrown
  return successApiResponse(enrollment || null)
}, { requiredPermission: 'read' })
