import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrlAssessmentService } from '@/lib/services/startup-studio/trl-assessment-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await TrlAssessmentService.getAssessments(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.trl_level || body.trl_level < 1 || body.trl_level > 9) {
    return errorResponse('trl_level (1-9) is required', 400)
  }
  if (!body.evidence_description) {
    return errorResponse('evidence_description is required', 400)
  }

  const result = await TrlAssessmentService.createAssessment({
    ...body,
    candidate_id: id,
  })
  return createdResponse(result)
})
