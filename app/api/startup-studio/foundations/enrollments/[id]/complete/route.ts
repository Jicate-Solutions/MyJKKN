import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { FoundationsService } from '@/lib/services/startup-studio/foundations-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// POST /api/startup-studio/foundations/enrollments/[id]/complete
// D5 — a mentor/coordinator signs off a student's Foundations completion. Asserts
// the student met the global graduation threshold, marks the enrollment 'completed'
// and graduates the linked cohort membership (best-effort). Mentor-gated, not self-serve.
export const POST = withAuth(
  async (request, auth, context) => {
    const { id: enrollmentId } = await context!.params!
    try {
      const result = await FoundationsService.signOffGraduation(enrollmentId, auth.user.id)
      return successApiResponse(result)
    } catch (err) {
      // A not-yet-complete student or a missing enrollment is a client error (400),
      // not a 500 — signOffGraduation tags those with .status = 400.
      const status = (err as { status?: number })?.status
      if (status === 400) return errorResponse((err as Error).message, 400)
      throw err
    }
  },
  // allowApiKey:false — the mentor sign-off is a browser action. withAuth only
  // evaluates requirePermission for session auth; an API-key caller would SKIP the
  // 'startup_studio.foundations.review' check entirely (with-auth.ts:192), so a
  // write-scoped key could self-ratify graduation. Refusing API keys keeps the D5
  // mentor gate enforced. (Review finding: requirePermission is inert for api_key.)
  { requiredPermission: 'write', requirePermission: 'startup_studio.foundations.review', allowApiKey: false }
)
