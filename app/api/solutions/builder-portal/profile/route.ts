import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuilderPortalService } from '@/lib/services/solutions/builder-portal-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (_request, auth) => {
  const profile = await BuilderPortalService.getBuilderByUserId(auth.user.id)
  if (!profile) {
    return errorResponse('Builder profile not found for current user', 404)
  }
  return successApiResponse(profile)
}, { requiredPermission: 'read', allowApiKey: false })
