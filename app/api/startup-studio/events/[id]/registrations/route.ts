import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TeamsService } from '@/lib/services/startup-studio/teams-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'
import { getStringParam, getUuidParam } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get all registrations for an event with stats
export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const url = new URL(request.url)
  const institution_id = getUuidParam(url, 'institution_id')
  const registration_status = getStringParam(url, 'registration_status')
  const search = getStringParam(url, 'search')

  const result = await TeamsService.getEventRegistrations(id, {
    institution_id,
    registration_status,
    search,
  })

  return successApiResponse(result)
}, { requiredPermission: 'read' })

// Bulk update registration status
export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const body = await request.json()
  if (!body.team_ids || !Array.isArray(body.team_ids) || body.team_ids.length === 0) {
    return errorResponse('team_ids array is required', 400)
  }
  if (!body.status) return errorResponse('status is required', 400)

  const VALID_STATUSES = ['registered', 'confirmed', 'checked_in']
  if (!VALID_STATUSES.includes(body.status)) {
    return errorResponse(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400)
  }

  await TeamsService.updateRegistrationStatus(body.team_ids, body.status)
  return successApiResponse({ updated: body.team_ids.length })
}, { requireRole: ['admin', 'super_admin'] })
