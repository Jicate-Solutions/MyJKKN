import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DiscoveryService } from '@/lib/services/solutions/discovery-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await DiscoveryService.getCommunicationById(id)
  if (!result) return errorResponse('Communication not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, client_id, institution_id, created_by, created_at, ...safeBody } = body
  const result = await DiscoveryService.updateCommunication(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await DiscoveryService.deleteCommunication(id)
  return noContentResponse()
})
