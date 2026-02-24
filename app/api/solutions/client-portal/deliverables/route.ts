import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ClientPortalService } from '@/lib/services/solutions/client-portal-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const profile = await ClientPortalService.getClientProfile(auth.user.id)
  if (!profile) return errorResponse('Client profile not found', 404)

  const url = new URL(request.url)
  const status = getStringParam(url, 'status')

  const deliverables = await ClientPortalService.getClientDeliverables(profile.id, status)
  return successApiResponse(deliverables)
}, { requiredPermission: 'read', allowApiKey: false })

export const PATCH = withAuth(async (request, auth) => {
  const profile = await ClientPortalService.getClientProfile(auth.user.id)
  if (!profile) return errorResponse('Client profile not found', 404)

  const body = await request.json()
  const { deliverable_id, action, notes } = body

  if (!deliverable_id) {
    return errorResponse('deliverable_id is required', 400)
  }

  if (action === 'approve') {
    await ClientPortalService.approveDeliverable(deliverable_id)
  } else if (action === 'revision') {
    if (!notes) return errorResponse('notes are required for revision requests', 400)
    await ClientPortalService.requestDeliverableRevision(deliverable_id, notes)
  } else {
    return errorResponse('action must be "approve" or "revision"', 400)
  }

  return successApiResponse({ success: true })
}, { allowApiKey: false })
