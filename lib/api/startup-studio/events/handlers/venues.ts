import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { VenuesService } from '@/lib/services/startup-studio/venues-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid, getStringParam } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get venues for an event day, optionally with stats only
export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const url = new URL(request.url)
  const dayType = getStringParam(url, 'dayType')
  const stats = getStringParam(url, 'stats')

  if (!dayType) return errorResponse('dayType query param is required (build_day or demo_day)', 400)

  const VALID_DAY_TYPES = ['build_day', 'demo_day']
  if (!VALID_DAY_TYPES.includes(dayType)) {
    return errorResponse(`Invalid dayType. Must be one of: ${VALID_DAY_TYPES.join(', ')}`, 400)
  }

  if (stats === 'true') {
    const data = await VenuesService.getVenueStats(id, dayType)
    return successApiResponse(data)
  }

  const data = await VenuesService.getEventVenues(id, dayType)
  return successApiResponse(data)
}, { requiredPermission: 'read' })

// Add a venue to an event
export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const body = await request.json()

  if (!body.day_type) return errorResponse('day_type is required', 400)
  const VALID_DAY_TYPES = ['build_day', 'demo_day']
  if (!VALID_DAY_TYPES.includes(body.day_type)) {
    return errorResponse(`Invalid day_type. Must be one of: ${VALID_DAY_TYPES.join(', ')}`, 400)
  }

  if (!body.venue_name || typeof body.venue_name !== 'string' || !body.venue_name.trim()) {
    return errorResponse('venue_name is required', 400)
  }

  const data = await VenuesService.addEventVenue({
    event_id: id,
    day_type: body.day_type,
    venue_name: body.venue_name.trim(),
    resource_id: body.resource_id || null,
    institution_id: body.institution_id || auth.institutionId || null,
    capacity: body.capacity || null,
    location_info: body.location_info || null,
  })

  return createdResponse(data)
}, { requireRole: ['admin', 'super_admin'] })
