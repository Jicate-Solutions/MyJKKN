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
  const body_filter = getStringParam(url, 'body')
  const is_active_raw = getStringParam(url, 'is_active')
  const institution_id = getStringParam(url, 'institution_id')

  const is_active = is_active_raw === 'true' ? true : is_active_raw === 'false' ? false : undefined

  const data = await GovernanceService.getGovernanceMembers({
    body: body_filter,
    is_active,
    institution_id,
  })
  return successApiResponse(data)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body.name) {
    return errorResponse('name is required', 400)
  }
  if (!body.body) {
    return errorResponse('body (governance body) is required', 400)
  }
  if (!body.role) {
    return errorResponse('role is required', 400)
  }

  const result = await GovernanceService.addGovernanceMember(body)
  return createdResponse(result)
})
