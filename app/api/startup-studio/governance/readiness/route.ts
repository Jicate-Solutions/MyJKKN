import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GovernanceService } from '@/lib/services/startup-studio/governance-service'
import { successApiResponse, createdResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const institution_id = getStringParam(url, 'institution_id')

  const data = await GovernanceService.getReadinessAssessments(institution_id)
  return successApiResponse(data)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  const result = await GovernanceService.createReadinessAssessment(body)
  return createdResponse(result)
})
