import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { RiskAssessmentService } from '@/lib/services/startup-studio/risk-assessment-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async () => {
  const result = await RiskAssessmentService.getHeatmap()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
