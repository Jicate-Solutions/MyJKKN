import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ContentService } from '@/lib/services/solutions/content-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!

  const result = await ContentService.approveDeliverable(id, auth.user.id)
  return successApiResponse(result)
})
