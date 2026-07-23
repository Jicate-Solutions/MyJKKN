import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/worksheets?cohort_id= — canon (+cohort overrides)
// Catalog content; RLS already restricts to authenticated. No permission-key gate so
// any enrolled learner can read the curriculum.
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url)
    const cohortId = getStringParam(url, 'cohort_id') ?? null
    const worksheets = await FoundationsService.listWorksheets(cohortId)
    return successApiResponse(worksheets)
  },
  { requiredPermission: 'read' }
)
