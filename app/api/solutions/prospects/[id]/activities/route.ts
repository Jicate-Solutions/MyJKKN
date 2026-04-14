import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProspectsService } from '@/lib/services/solutions/prospects-service'
import { successApiResponse, createdResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await ProspectsService.getProspectActivities(id)
  return successApiResponse(result)
}, { requiredPermission: 'read' })

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  const result = await ProspectsService.logActivity({
    ...body,
    prospect_id: id,
    created_by: auth.user.id,
  })

  return createdResponse(result)
})
