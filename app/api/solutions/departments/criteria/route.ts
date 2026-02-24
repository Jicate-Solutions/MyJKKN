import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request) => {
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('active_only') !== 'false'

  const criteria = await DepartmentTrackerService.getEligibilityCriteria(activeOnly)

  return successApiResponse(criteria)
}, { requiredPermission: 'read' })
