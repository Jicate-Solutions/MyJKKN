import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, _auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const { capabilities } = body

  if (!Array.isArray(capabilities)) {
    return errorResponse('capabilities must be an array of strings', 400)
  }

  await DepartmentTrackerService.updateCapabilities(id, capabilities)

  return successApiResponse({ message: 'Capabilities updated successfully' })
})
