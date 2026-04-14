import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuilderPortalService } from '@/lib/services/solutions/builder-portal-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth) => {
  const builder = await BuilderPortalService.getBuilderByUserId(auth.user.id)
  if (!builder) {
    return errorResponse('Builder profile not found for current user', 404)
  }

  const body = await request.json()
  const { phase_id, role } = body
  if (!phase_id) {
    return errorResponse('phase_id is required', 400)
  }

  const assignment = await BuilderPortalService.claimPhase(phase_id, builder.id, role)
  return createdResponse(assignment)
}, { allowApiKey: false })
