import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { SF100Service } from '@/lib/services/startup-studio'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { notificationId } = await context!.params!

  await SF100Service.markRead(notificationId)

  return successApiResponse({ notification_id: notificationId, read: true })
})
