import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { paginatedResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/review-queue?cohort_id=&status= — submissions to review.
// RLS scopes visible rows to the reviewer's own cohorts (or review-permission holders).
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url)
    const status = getStringParam(url, 'status') as 'submitted' | 'reviewed' | undefined
    const result = await FoundationsService.listReviewQueue({
      cohort_id: getStringParam(url, 'cohort_id'),
      status,
      page: Number(getStringParam(url, 'page')) || undefined,
      limit: Number(getStringParam(url, 'limit')) || undefined,
    })
    return paginatedResponse(
      result.data,
      result.metadata.total,
      result.metadata.page,
      result.metadata.limit
    )
  },
  { requiredPermission: 'read', requirePermission: 'startup_studio.foundations.review' }
)
