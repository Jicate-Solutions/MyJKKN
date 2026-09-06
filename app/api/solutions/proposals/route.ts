import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'
import { ProposalsService } from '@/lib/services/solutions/proposals-service'
import { paginatedResponse, createdResponse, errorResponse } from '@/lib/api/response'
import { getPaginationParams, getStringParam } from '@/lib/api-keys/query-helpers'
import { corsHeaders } from '@/lib/api-keys/cors'
import type { ProposalStatus } from '@/lib/services/solutions/types'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export const GET = withAuth(async (request) => {
  const url = new URL(request.url)
  const { page, limit } = getPaginationParams(url)
  const client_id = getStringParam(url, 'client_id')
  const status = getStringParam(url, 'status')

  const result = await ProposalsService.getProposals({
    client_id,
    status: status as ProposalStatus | undefined,
    page,
    limit,
  })

  return paginatedResponse(result.data, result.metadata.total, page, limit)
}, { requiredPermission: 'read', requirePermission: 'solutions.clients.view' })

export const POST = withAuth(async (request, auth) => {
  const body = await request.json()
  if (!body?.client_id) {
    return errorResponse('client_id is required', 400)
  }
  if (!body?.title || typeof body.title !== 'string' || !body.title.trim()) {
    return errorResponse('title is required', 400)
  }

  const result = await ProposalsService.createProposal({
    client_id: body.client_id,
    prospect_id: body.prospect_id,
    solution_id: body.solution_id,
    title: body.title.trim(),
    amount_inr: body.amount_inr,
    notes: body.notes,
    file_url: body.file_url,
    created_by: auth.user.id,
  })

  return createdResponse(result)
  // Second gate on top of RLS: proposals are commercial data. The solutions
  // module has no write-tier keys yet, so the clients view key (held by the
  // same 3 roles RLS admits) is the narrowest existing gate.
}, { requiredPermission: 'write', requirePermission: 'solutions.clients.view' })
