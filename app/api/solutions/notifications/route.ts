import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { NotificationsService } from '@/lib/services/solutions/notifications-service'
import { paginatedResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const type = getStringParam(url, 'type')
  const readParam = getStringParam(url, 'read')

  const result = await NotificationsService.getNotifications({
    page,
    limit,
    user_id: auth.user.id,
    type: type as any,
    read: readParam !== undefined ? readParam === 'true' : undefined,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read' })
