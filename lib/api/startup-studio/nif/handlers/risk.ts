import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { RiskAssessmentService } from '@/lib/services/startup-studio/risk-assessment-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await RiskAssessmentService.getAssessments(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  const requiredScores = ['magic_score', 'market_score', 'management_score', 'money_score']
  for (const field of requiredScores) {
    const val = body[field]
    if (val === undefined || val === null || val < 1 || val > 10) {
      return errorResponse(`${field} (1-10) is required`, 400)
    }
  }

  const result = await RiskAssessmentService.createAssessment({
    ...body,
    candidate_id: id,
  })
  return createdResponse(result)
})
