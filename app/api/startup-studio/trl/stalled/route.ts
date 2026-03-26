import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { TrlAssessmentService } from '@/lib/services/startup-studio/trl-assessment-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request) => {
  const url = new URL(request.url)
  const months = url.searchParams.get('months')
  const result = await TrlAssessmentService.getStalledStartups(months ? parseInt(months) : undefined)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
