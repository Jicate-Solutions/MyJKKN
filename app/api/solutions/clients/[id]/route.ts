import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ClientsService } from '@/lib/services/solutions/clients-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await ClientsService.getClientById(id)
  if (!result) return errorResponse('Client not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { institution_id, created_by, created_at, id: _id, ...safeBody } = body
  const result = await ClientsService.updateClient(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await ClientsService.deactivateClient(id)
  return noContentResponse()
})
