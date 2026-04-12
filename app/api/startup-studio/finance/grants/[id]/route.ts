import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FinanceService } from '@/lib/services/startup-studio/finance-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  // Fetch all grants and find by id (service has no getById)
  const grants = await FinanceService.getGrants()
  const grant = grants.find((g: any) => g.id === id)
  if (!grant) return errorResponse('Grant not found', 404)
  return successApiResponse(grant)
}, { requiredPermission: 'read' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { id: _id, created_at, updated_at, institution_id, ...safeBody } = body
  const result = await FinanceService.updateGrant(id, safeBody)
  return successApiResponse(result)
})
