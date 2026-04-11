import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { MarketingService } from '@/lib/services/startup-studio/marketing-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await MarketingService.getActivity(id, auth.institutionId)
  if (!result) return errorResponse('Marketing activity not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const result = await MarketingService.updateActivity(id, body, auth.institutionId)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await MarketingService.deleteActivity(id, auth.institutionId)
  return noContentResponse()
})
