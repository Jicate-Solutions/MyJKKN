import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { BuilderPortalService } from '@/lib/services/solutions/builder-portal-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (_request, auth) => {
  const builder = await BuilderPortalService.getBuilderByUserId(auth.user.id)
  if (!builder) {
    return errorResponse('Builder profile not found for current user', 404)
  }

  const earnings = await BuilderPortalService.getMyEarnings(builder.id)
  return successApiResponse(earnings)
}, { requiredPermission: 'read', allowApiKey: false })
