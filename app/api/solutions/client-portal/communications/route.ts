import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ClientPortalService } from '@/lib/services/solutions/client-portal-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const profile = await ClientPortalService.getClientProfile(auth.user.id)
  if (!profile) return errorResponse('Client profile not found', 404)

  const communications = await ClientPortalService.getClientCommunications(profile.id)
  return successApiResponse(communications)
}, { requiredPermission: 'read', allowApiKey: false })

export const POST = withAuth(async (request, auth) => {
  const profile = await ClientPortalService.getClientProfile(auth.user.id)
  if (!profile) return errorResponse('Client profile not found', 404)

  const body = await request.json()
  if (!body.subject || !body.message) {
    return errorResponse('subject and message are required', 400)
  }

  await ClientPortalService.sendMessage({
    clientId: profile.id,
    subject: body.subject,
    message: body.message,
    solutionId: body.solution_id,
  })

  return createdResponse({ success: true })
}, { allowApiKey: false })
