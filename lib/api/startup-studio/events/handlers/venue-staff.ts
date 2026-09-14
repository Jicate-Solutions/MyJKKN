import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { VenuesService } from '@/lib/services/startup-studio/venues-service'
import { successApiResponse, createdResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Assign mentors/judges to a venue
export const POST = withAuth(async (request, auth, context) => {
  const { id, venueId } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)
  if (!isValidUuid(venueId)) return errorResponse('Invalid venue ID format', 400)

  const body = await request.json()

  if (!body.user_ids || !Array.isArray(body.user_ids) || body.user_ids.length === 0) {
    return errorResponse('user_ids array is required', 400)
  }

  // Validate all user IDs are valid UUIDs
  for (const userId of body.user_ids) {
    if (!isValidUuid(userId)) {
      return errorResponse(`Invalid user ID format: ${userId}`, 400)
    }
  }

  if (!body.role) return errorResponse('role is required', 400)
  const VALID_ROLES = ['mentor', 'lead_mentor', 'judge', 'panel_chair']
  if (!VALID_ROLES.includes(body.role)) {
    return errorResponse(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`, 400)
  }

  const data = await VenuesService.assignStaff(venueId, body.user_ids, body.role)
  return createdResponse(data)
}, { requireRole: ['admin', 'super_admin'] })

// Remove a staff member from a venue
export const DELETE = withAuth(async (request, auth, context) => {
  const { id, venueId } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)
  if (!isValidUuid(venueId)) return errorResponse('Invalid venue ID format', 400)

  const body = await request.json()

  if (!body.user_id) return errorResponse('user_id is required', 400)
  if (!isValidUuid(body.user_id)) return errorResponse('Invalid user_id format', 400)

  await VenuesService.removeStaff(venueId, body.user_id)
  return noContentResponse()
}, { requireRole: ['admin', 'super_admin'] })
