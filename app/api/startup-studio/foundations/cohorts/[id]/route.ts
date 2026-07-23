import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET /api/startup-studio/foundations/cohorts/[id]
export const GET = withAuth(
  async (request, auth, context) => {
    const { id } = await context!.params!
    const cohort = await FoundationsService.getCohort(id)
    if (!cohort) return errorResponse('Cohort not found', 404)
    return successApiResponse(cohort)
  },
  { requiredPermission: 'read', requirePermission: 'startup_studio.foundations.view' }
)

// PATCH /api/startup-studio/foundations/cohorts/[id]
export const PATCH = withAuth(
  async (request, auth, context) => {
    const { id } = await context!.params!
    const body = await request.json()
    const cohort = await FoundationsService.updateCohort(id, body)
    return successApiResponse(cohort)
  },
  { requiredPermission: 'write', requirePermission: 'startup_studio.foundations.manage' }
)
