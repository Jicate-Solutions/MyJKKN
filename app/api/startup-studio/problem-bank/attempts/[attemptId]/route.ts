import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProblemBankService } from '@/lib/services/startup-studio/problem-bank-service'
import { successApiResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const PATCH = withAuth(async (request, auth, context) => {
  const { attemptId } = await context!.params!
  const body = await request.json()
  const result = await ProblemBankService.updateAttempt(attemptId, body)
  return successApiResponse(result)
})
