import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuilderPortalService } from '@/lib/services/solutions/builder-portal-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'
import type { AssignmentStatus } from '@/lib/services/solutions/types'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const builder = await BuilderPortalService.getBuilderByUserId(auth.user.id)
  if (!builder) {
    return errorResponse('Builder profile not found for current user', 404)
  }

  const url = new URL(request.url)
  const status = getStringParam(url, 'status') as AssignmentStatus | undefined

  const assignments = await BuilderPortalService.getMyAssignments(builder.id, status)
  return successApiResponse(assignments)
}, { requiredPermission: 'read', allowApiKey: false })
