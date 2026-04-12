import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const unreadOnly = url.searchParams.get('unread_only') === 'true'

  const result = await SF100Service.getMyNotifications(auth.user.id, unreadOnly)
  return successApiResponse(result)
}, { requiredPermission: 'read' })
