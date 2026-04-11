import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { VenuesService } from '@/lib/services/startup-studio/venues-service'
import { successApiResponse, createdResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Allocate teams to a venue
export const POST = withAuth(async (request, auth, context) => {
  const { id, venueId } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)
  if (!isValidUuid(venueId)) return errorResponse('Invalid venue ID format', 400)

  const body = await request.json()

  if (!body.team_ids || !Array.isArray(body.team_ids) || body.team_ids.length === 0) {
    return errorResponse('team_ids array is required', 400)
  }

  // Validate all team IDs are valid UUIDs
  for (const teamId of body.team_ids) {
    if (!isValidUuid(teamId)) {
      return errorResponse(`Invalid team ID format: ${teamId}`, 400)
    }
  }

  // Get day_type from the venue record
  const { data: venue, error: venueError } = await auth.supabase
    .from('ss_event_venues')
    .select('day_type')
    .eq('id', venueId)
    .single()

  if (venueError || !venue) {
    return errorResponse('Venue not found', 404)
  }

  const data = await VenuesService.allocateTeams(venueId, body.team_ids, venue.day_type)
  return createdResponse(data)
}, { requireRole: ['admin', 'super_admin'] })

// Remove a team from a venue
export const DELETE = withAuth(async (request, auth, context) => {
  const { id, venueId } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)
  if (!isValidUuid(venueId)) return errorResponse('Invalid venue ID format', 400)

  const body = await request.json()

  if (!body.team_id) return errorResponse('team_id is required', 400)
  if (!isValidUuid(body.team_id)) return errorResponse('Invalid team_id format', 400)

  // Get day_type from the venue record
  const { data: venue, error: venueError } = await auth.supabase
    .from('ss_event_venues')
    .select('day_type')
    .eq('id', venueId)
    .single()

  if (venueError || !venue) {
    return errorResponse('Venue not found', 404)
  }

  await VenuesService.removeTeamFromVenue(body.team_id, venue.day_type)
  return noContentResponse()
}, { requireRole: ['admin', 'super_admin'] })
