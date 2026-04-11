import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { VenuesService } from '@/lib/services/startup-studio/venues-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid, getStringParam } from '@/lib/api-keys/query-helpers'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// Search available mentors/senior learners for venue assignment
export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid event ID format', 400)

  const url = new URL(request.url)
  const search = getStringParam(url, 'search')

  const data = await VenuesService.getAvailableMentors(id, search)
  return successApiResponse(data)
}, { requiredPermission: 'read' })
