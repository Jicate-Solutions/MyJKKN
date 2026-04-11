import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProblemBankService } from '@/lib/services/startup-studio/problem-bank-service'
import { noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const DELETE = withAuth(async (request, auth, context) => {
  const { tagId } = await context!.params!
  await ProblemBankService.removeTag(tagId)
  return noContentResponse()
})
