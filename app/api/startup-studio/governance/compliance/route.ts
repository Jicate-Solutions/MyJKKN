import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { GovernanceService } from '@/lib/services/startup-studio/governance-service'
import { successApiResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const category = getStringParam(url, 'category')
  const status = getStringParam(url, 'status')
  const is_critical_raw = getStringParam(url, 'is_critical')
  const institution_id = getStringParam(url, 'institution_id')

  const is_critical = is_critical_raw === 'true' ? true : is_critical_raw === 'false' ? false : undefined

  const data = await GovernanceService.getComplianceItems({
    category,
    status,
    is_critical,
    institution_id,
  })
  return successApiResponse(data)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.category) {
    return errorResponse('category is required', 400)
  }
  if (!body.requirement) {
    return errorResponse('requirement is required', 400)
  }
  if (!body.frequency) {
    return errorResponse('frequency is required', 400)
  }

  const result = await GovernanceService.createComplianceItem(body)
  return createdResponse(result)
})
