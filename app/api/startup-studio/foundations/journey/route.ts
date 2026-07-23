import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/journey?cohort_id= — worksheets joined with the
// caller's own responses (drives the my-journey stepper).
export const GET = withAuth(
  async (request, auth) => {
    const url = new URL(request.url)
    const cohortId = getStringParam(url, 'cohort_id') ?? null
    const journey = await FoundationsService.getJourney(auth.user.id, cohortId)
    return successApiResponse(journey)
  },
  { requiredPermission: 'read' }
)
