import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { RiskAssessmentService } from '@/lib/services/startup-studio/risk-assessment-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request) => {
  const url = new URL(request.url)
  const threshold = url.searchParams.get('threshold')
  const result = await RiskAssessmentService.getHighRiskStartups(threshold ? parseInt(threshold) : undefined)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
