import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { CohortService } from '@/lib/services/solutions/cohort-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (req, context) => {
  const { id } = await context!.params!
  const body = await req.json()

  const result = await CohortService.updateAssignment(id, body)

  return successApiResponse(result)
})
