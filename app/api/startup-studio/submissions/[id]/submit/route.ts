import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SubmissionsService } from '@/lib/services/startup-studio/submissions-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await SubmissionsService.submitForReview(id)
  return successApiResponse(result)
})
