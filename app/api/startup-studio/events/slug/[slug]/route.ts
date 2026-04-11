import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { EventsService } from '@/lib/services/startup-studio/events-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { slug } = await context!.params!
  const result = await EventsService.getEventBySlug(slug)
  if (!result) return errorResponse('Event not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
