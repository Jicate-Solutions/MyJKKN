import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json().catch(() => ({}))
  const reviewNotes = body.review_notes || undefined

  const newDepartmentId = await DepartmentTrackerService.approveNomination(
    id,
    auth.user.id,
    reviewNotes
  )

  return successApiResponse({
    solution_department_id: newDepartmentId,
    message: 'Nomination approved successfully',
  })
})
