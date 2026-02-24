import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import type { NominationStatus } from '@/lib/services/solutions/department-tracker-service'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') as NominationStatus | null

  const nominations = await DepartmentTrackerService.getNominations(
    status || undefined
  )

  return successApiResponse(nominations)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const { department_id, institution_id, nomination_reason, suggested_capabilities } = body

  if (!department_id || !institution_id || !nomination_reason) {
    return errorResponse('department_id, institution_id, and nomination_reason are required', 400)
  }

  const nomination = await DepartmentTrackerService.nominateDepartment({
    department_id,
    institution_id,
    nomination_reason,
    suggested_capabilities: suggested_capabilities || [],
    nominated_by: auth.user.id,
  })

  return createdResponse(nomination)
})
