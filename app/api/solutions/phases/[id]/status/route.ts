import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PhasesService } from '@/lib/services/solutions/phases-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.status) {
    return errorResponse('status is required', 400)
  }

  const result = await PhasesService.updatePhaseStatus(id, body.status)
  return successApiResponse(result)
})
