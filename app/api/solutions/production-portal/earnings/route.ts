import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProductionService } from '@/lib/services/solutions/production-service'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (_request, auth) => {
  const learner = await ProductionService.getLearnerByUserId(auth.user.id)
  if (!learner) {
    return errorResponse('Production learner profile not found for current user', 404)
  }

  const assignments = await ProductionService.getAssignmentsByLearnerId(learner.id)

  const completed = assignments.filter(a => a.completed_at != null)
  const totalEarnings = completed.reduce((sum, a) => sum + ((a as any).earnings ?? 0), 0)

  return successApiResponse({
    total_earnings: learner.total_earnings ?? 0,
    orders_completed: learner.orders_completed ?? 0,
    recent_assignments: assignments.slice(0, 10),
    earnings_from_assignments: totalEarnings,
  })
}, { requiredPermission: 'read', allowApiKey: false })
