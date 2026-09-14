import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { PresentationsService } from '@/lib/services/startup-studio/presentations-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get all presentation slots for an event
export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const data = await PresentationsService.getEventSlots(id)
  return successApiResponse(data)
}, { requiredPermission: 'read' })

// POST handles multiple actions: generate, assign, update_status
export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const body = await request.json()

  if (body.action === 'generate') {
    if (!body.start_time) return errorResponse('start_time is required', 400)
    if (!body.count || body.count < 1) return errorResponse('count must be at least 1', 400)

    const data = await PresentationsService.generateSlots({
      event_id: id,
      start_time: body.start_time,
      duration_mins: body.duration_mins || 10,
      count: body.count,
      room: body.room,
    })
    return createdResponse(data)
  }

  if (body.action === 'assign') {
    if (!body.slot_id) return errorResponse('slot_id is required', 400)
    if (!body.team_id) return errorResponse('team_id is required', 400)

    const data = await PresentationsService.assignTeamToSlot(
      body.slot_id,
      body.team_id,
      body.submission_id
    )
    return successApiResponse(data)
  }

  if (body.action === 'update_status') {
    if (!body.slot_id) return errorResponse('slot_id is required', 400)
    if (!body.status) return errorResponse('status is required', 400)

    const VALID_STATUSES = ['scheduled', 'presenting', 'completed', 'skipped']
    if (!VALID_STATUSES.includes(body.status)) {
      return errorResponse(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, 400)
    }

    const data = await PresentationsService.updateSlotStatus(body.slot_id, body.status)
    return successApiResponse(data)
  }

  return errorResponse('Invalid action. Must be: generate, assign, or update_status', 400)
}, { requireRole: ['admin', 'super_admin'] })
