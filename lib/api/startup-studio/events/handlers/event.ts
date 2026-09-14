import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { EventsService } from '@/lib/services/startup-studio/events-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await EventsService.getEventById(id)
  if (!result) return errorResponse('Event not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, created_at, ...safeBody } = body
  const result = await EventsService.updateEvent(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await EventsService.deleteEvent(id)
  return noContentResponse()
})
