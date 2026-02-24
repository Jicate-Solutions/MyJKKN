import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ClientPortalService } from '@/lib/services/solutions/client-portal-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const profile = await ClientPortalService.getClientProfile(auth.user.id)
  if (!profile) return errorResponse('Client profile not found', 404)

  const stats = await ClientPortalService.getDashboardStats(profile.id)
  return successApiResponse(stats)
}, { requiredPermission: 'read', allowApiKey: false })
