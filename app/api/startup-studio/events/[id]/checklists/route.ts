import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ChecklistsService } from '@/lib/services/startup-studio/checklists-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/utils/validation'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Get all checklists for an event
export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const data = await ChecklistsService.getEventChecklists(id)
  return successApiResponse(data)
}, { requiredPermission: 'read' })

// POST handles multiple actions: seed, toggle, create
export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const body = await request.json()

  if (body.action === 'seed') {
    const data = await ChecklistsService.seedDefaultChecklists(id)
    return createdResponse(data)
  }

  if (body.action === 'toggle' || body.checklist_id) {
    if (!body.checklist_id) return errorResponse('checklist_id is required', 400)
    const data = await ChecklistsService.toggleChecklistResponse({
      checklist_id: body.checklist_id,
      user_id: auth.user.id,
      institution_id: auth.institutionId || undefined,
      is_completed: body.is_completed ?? true,
      notes: body.notes,
    })
    return successApiResponse(data)
  }

  // Create new checklist item
  if (body.title && body.phase) {
    const data = await ChecklistsService.createChecklistItem({
      event_id: id,
      phase: body.phase,
      title: body.title,
      description: body.description,
      sort_order: body.sort_order || 0,
    })
    return createdResponse(data)
  }

  return errorResponse('Invalid request. Provide action or checklist fields.', 400)
})
