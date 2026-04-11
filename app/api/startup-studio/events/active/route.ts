import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { EventsService } from '@/lib/services/startup-studio/events-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const result = await EventsService.getActiveEvents()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
