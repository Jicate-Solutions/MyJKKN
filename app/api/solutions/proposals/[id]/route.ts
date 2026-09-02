import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProposalsService } from '@/lib/services/solutions/proposals-service'
import { successApiResponse, errorResponse, noContentResponse } from '@/lib/api/response'
import { corsHeaders } from '@/lib/api-keys/cors'
import type { ProposalStatus } from '@/lib/services/solutions/types'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const result = await ProposalsService.getProposalById(id)
  if (!result) return errorResponse('Proposal not found', 404)
  return successApiResponse(result)
}, { requiredPermission: 'read', requirePermission: 'solutions.clients.view' })

export const PATCH = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  const body = await request.json()
  const {
    id: _id,
    created_by: _createdBy,
    created_at: _createdAt,
    client_id: _clientId,
    // sent_at / approved_at / signed_at are server-stamped on status
    // transitions — never writable from the request body, or the
    // approval-latency numbers stop being trustworthy.
    sent_at: _sentAt,
    approved_at: _approvedAt,
    signed_at: _signedAt,
    status,
    ...safeBody
  } = body

  // Field edits first (if any), then the status transition so the matching
  // timestamp is stamped server-side by advanceStatus.
  let result = null
  if (Object.keys(safeBody).length > 0) {
    result = await ProposalsService.updateProposal(id, safeBody)
  }
  if (status) {
    result = await ProposalsService.advanceStatus(id, status as ProposalStatus)
  }
  if (!result) {
    return errorResponse('No changes provided', 400)
  }
  return successApiResponse(result)
}, { requiredPermission: 'write', requirePermission: 'solutions.clients.view' })

export const DELETE = withAuth(async (request, auth, context) => {
  const { id } = await context!.params!
  await ProposalsService.deleteProposal(id)
  return noContentResponse()
}, { requiredPermission: 'write', requirePermission: 'solutions.clients.view' })
