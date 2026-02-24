import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { NotificationsService } from '@/lib/services/solutions/notifications-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await NotificationsService.markAsRead(id)
  return successApiResponse(result)
})
