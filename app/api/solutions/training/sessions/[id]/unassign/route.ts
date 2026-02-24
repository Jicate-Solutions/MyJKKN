import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrainingService } from '@/lib/services/solutions/training-service'
import { errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (req, context) => {
  const { id } = await context!.params!
  const body = await req.json()

  if (!body.cohort_member_id) {
    return errorResponse('cohort_member_id is required', 400)
  }

  await TrainingService.removeAssignment(id, body.cohort_member_id)

  return noContentResponse()
})
