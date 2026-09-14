import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { VenuesService } from '@/lib/services/startup-studio/venues-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Update venue fields
export const PATCH = withAuth(async (request, auth, context) => {
  const { id, venueId } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)
  if (!isValidUuid(venueId)) return errorResponse('Invalid venue ID format', 400)

  const body = await request.json()

  // Only allow specific fields to be updated
  const allowedFields = ['venue_name', 'capacity', 'location_info', 'status']
  const updates: Record<string, any> = {}
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field]
    }
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse('No valid fields to update. Allowed: venue_name, capacity, location_info, status', 400)
  }

  if (updates.status) {
    const VALID_STATUSES = ['active', 'inactive']
    if (!VALID_STATUSES.includes(updates.status)) {
      return errorResponse(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400)
    }
  }

  updates.updated_at = new Date().toISOString()

  const { data, error } = await auth.supabase
    .from('ss_event_venues')
    .update(updates)
    .eq('id', venueId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update venue: ${error.message}`)

  return successApiResponse(data)
}, { requireRole: ['admin', 'super_admin'] })

// Remove venue
export const DELETE = withAuth(async (request, auth, context) => {
  const { id, venueId } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)
  if (!isValidUuid(venueId)) return errorResponse('Invalid venue ID format', 400)

  await VenuesService.removeEventVenue(venueId)
  return noContentResponse()
}, { requireRole: ['admin', 'super_admin'] })
