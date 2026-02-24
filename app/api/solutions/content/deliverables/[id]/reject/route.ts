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
  const body = await request.json().catch(() => ({}))

  const result = await ContentService.rejectDeliverable(id, body.notes)
  return successApiResponse(result)
})
