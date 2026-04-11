import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrlAssessmentService } from '@/lib/services/startup-studio/trl-assessment-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async () => {
  const result = await TrlAssessmentService.getDistribution()
  return successApiResponse(result)
}, { requiredPermission: 'read' })
