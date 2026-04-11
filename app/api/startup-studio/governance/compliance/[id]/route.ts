import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GovernanceService } from '@/lib/services/startup-studio/governance-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.status) {
    return errorResponse('status is required', 400)
  }

  const result = await GovernanceService.updateComplianceStatus(id, {
    status: body.status,
    completed_date: body.completed_date,
    completed_by: body.completed_by,
    evidence_url: body.evidence_url,
    notes: body.notes,
  })
  return successApiResponse(result)
})
