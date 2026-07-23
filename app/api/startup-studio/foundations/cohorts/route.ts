import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/cohorts — list cohorts (facilitator/admin view)
export const GET = withAuth(
  async (request) => {
    const url = new URL(request.url)
    const result = await FoundationsService.listCohorts({
      institution_id: getStringParam(url, 'institution_id'),
      status: getStringParam(url, 'status'),
      search: getStringParam(url, 'search'),
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
  { requiredPermission: 'read', requirePermission: 'startup_studio.foundations.view' }
)

// POST /api/startup-studio/foundations/cohorts — create a cohort
export const POST = withAuth(
  async (request, auth) => {
    const body = await request.json()
    if (!body.name || !body.institution_id) {
      return errorResponse('name and institution_id are required', 400)
    }
    const cohort = await FoundationsService.createCohort(body, auth.user.id)
    return createdResponse(cohort)
  },
  { requiredPermission: 'write', requirePermission: 'startup_studio.foundations.manage' }
)
