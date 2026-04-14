import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DeploymentsService } from '@/lib/services/solutions/deployments-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await DeploymentsService.getDeploymentById(id)
  if (!result) return errorResponse('Deployment not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { institution_id, created_by, created_at, id: _id, ...safeBody } = body
  const result = await DeploymentsService.updateDeployment(id, safeBody)
  return successApiResponse(result)
})

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await DeploymentsService.deleteDeployment(id)
  return noContentResponse()
})
