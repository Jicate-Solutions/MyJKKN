import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { successApiResponse, errorResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import { isValidUuid } from '@/lib/api-keys/query-helpers'
import { BaseService } from '@/lib/services/base-service'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

const ADMIN_ROLES = ['admin', 'super_admin', 'administrator']

/**
 * PATCH - Update metrics (MRR, paying users, proof) on a submission.
 * Only the submission owner (user_id) or an admin can update.
 */
export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  if (!isValidUuid(id)) return errorResponse('Invalid submission ID format', 400)

  const body = await request.json()
  const { mrr_amount, paying_users_count, total_users, active_users, proof_urls } = body

  // Validate inputs
  if (mrr_amount !== undefined && (typeof mrr_amount !== 'number' || mrr_amount < 0)) {
    return errorResponse('MRR amount must be a non-negative number', 400)
  }
  if (paying_users_count !== undefined && (typeof paying_users_count !== 'number' || paying_users_count < 0 || !Number.isInteger(paying_users_count))) {
    return errorResponse('Paying users count must be a non-negative integer', 400)
  }
  if (total_users !== undefined && (typeof total_users !== 'number' || total_users < 0 || !Number.isInteger(total_users))) {
    return errorResponse('Total users must be a non-negative integer', 400)
  }
  if (active_users !== undefined && (typeof active_users !== 'number' || active_users < 0 || !Number.isInteger(active_users))) {
    return errorResponse('Active users must be a non-negative integer', 400)
  }
  if (proof_urls !== undefined && !Array.isArray(proof_urls)) {
    return errorResponse('Proof URLs must be an array of strings', 400)
  }

  const supabase = BaseService.getSupabase()
  const userId = auth.user.id
  const isAdmin = auth.user.role ? ADMIN_ROLES.includes(auth.user.role) : false

  // Fetch the submission to check ownership
  const { data: submission, error: fetchError } = await supabase
    .from('ss_appathon_submissions')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (fetchError || !submission) {
    return errorResponse('Submission not found', 404)
  }

  // Only owner or admin can update metrics
  if (submission.user_id !== userId && !isAdmin) {
    return errorResponse('You can only update metrics on your own submission', 403)
  }

  // Build update payload
  const updates: Record<string, any> = {
    metrics_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (mrr_amount !== undefined) updates.mrr_amount = mrr_amount
  if (paying_users_count !== undefined) updates.paying_users_count = paying_users_count
  if (total_users !== undefined) updates.total_users = total_users
  if (active_users !== undefined) updates.active_users = active_users
  if (proof_urls !== undefined) updates.proof_urls = proof_urls

  const { data: updated, error: updateError } = await supabase
    .from('ss_appathon_submissions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (updateError) {
    return errorResponse(`Failed to update metrics: ${updateError.message}`, 500)
  }

  return successApiResponse(updated)
})
