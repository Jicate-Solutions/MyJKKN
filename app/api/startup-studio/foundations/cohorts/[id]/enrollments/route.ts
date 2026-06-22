import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/cohorts/[id]/enrollments — cohort roster
export const GET = withAuth(
  async (request, auth, context) => {
    const { id: cohortId } = await context!.params!
    const url = new URL(request.url)
    const result = await FoundationsService.listEnrollments(cohortId, {
      status: getStringParam(url, 'status'),
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

// POST /api/startup-studio/foundations/cohorts/[id]/enrollments — facilitator enrols a student
export const POST = withAuth(
  async (request, auth, context) => {
    const { id: cohortId } = await context!.params!
    const body = await request.json()
    if (!body.student_id) return errorResponse('student_id is required', 400)
    const enrollment = await FoundationsService.enroll(
      cohortId,
      body.student_id,
      'facilitator',
      auth.user.id
    )
    return createdResponse(enrollment)
  },
  { requiredPermission: 'write', requirePermission: 'startup_studio.foundations.manage' }
)
