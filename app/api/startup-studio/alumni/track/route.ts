import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GraduationService } from '@/lib/services/startup-studio/graduation-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()

  if (!body.candidate_id || !body.tracking_year) {
    return errorResponse('candidate_id and tracking_year are required', 400)
  }

  const result = await GraduationService.trackAlumni(body)
  return createdResponse(result)
})
