import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProblemBankService } from '@/lib/services/startup-studio/problem-bank-service'
import { createdResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const POST = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  if (!body.tag || !body.tag_type) {
    return errorResponse('tag and tag_type are required', 400)
  }

  const result = await ProblemBankService.addTag(id, body.tag, body.tag_type, body.created_by)
  return createdResponse(result)
})
