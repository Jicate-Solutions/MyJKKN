import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ContentService } from '@/lib/services/solutions/content-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()

  if (!body.file_url) {
    return errorResponse('file_url is required', 400)
  }

  const result = await ContentService.submitForReview(
    id,
    body.file_url,
    body.file_format
  )

  return successApiResponse(result)
})
