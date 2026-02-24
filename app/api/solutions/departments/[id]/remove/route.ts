import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { reason } = body

  if (!reason) {
    return errorResponse('reason is required for removing a department', 400)
  }

  await DepartmentTrackerService.removeDepartment(id, reason, auth.user.id)

  return successApiResponse({ message: 'Department deactivated successfully' })
})
