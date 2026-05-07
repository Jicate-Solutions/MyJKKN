export const dynamic = 'force-dynamic';

// /api/id-cards/jobs
// Phase 1C — print-job queue endpoints.
//
// POST  — enqueue a print job for a (student_id, template_id).
//         Roles: super_admin / registrar / admission_admin.
//         Rejects duplicates (existing pending|rendering|sent_to_agent for same student) → 409.
//
// GET   — list jobs, filter by status, paginated by limit (default 50, max 200).
//         Reachable from EITHER a user session (super_admin / registrar / admission_admin)
//         OR an agent-token (Bearer ${AGENT_PRINT_TOKEN}). Agent uses this to poll for work.

import { NextRequest, connection } from 'next/server';
import { z } from 'zod';
import { jsonOk, jsonError } from '@/lib/id-cards/responses';
import { requireUser, requireUserOrAgent, isAuthFailure } from '@/lib/id-cards/auth';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  JOB_WRITER_ROLES,
  JOB_READER_ROLES,
  type IdCardPrintJob,
  type IdCardPrintJobStatus
} from '@/lib/id-cards/types';

const ACTIVE_STATUSES: IdCardPrintJobStatus[] = ['pending', 'rendering', 'sent_to_agent'];

const postBodySchema = z.object({
  student_id: z.string().uuid(),
  template_id: z.string().uuid()
});

const getQuerySchema = z.object({
  status: z.enum(['pending', 'rendering', 'sent_to_agent', 'printed', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50)
});

export async function POST(request: NextRequest) {
  await connection();
  try {
    const auth = await requireUser(JOB_WRITER_ROLES);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError('Request body must be valid JSON', 'bad_request', 400);
    }

    const parsed = postBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError(
        `Invalid body: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        'bad_request',
        400
      );
    }

    const { student_id, template_id } = parsed.data;

    // Reject duplicate active job for the same student.
    const { data: existing, error: dupeError } = await auth.supabase
      .from('id_card_print_jobs')
      .select('*')
      .eq('student_id', student_id)
      .in('status', ACTIVE_STATUSES)
      .order('enqueued_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dupeError) {
      console.error('[id-cards/jobs] POST dupe-check error:', dupeError);
      return jsonError(
        `Failed to check for duplicate jobs: ${dupeError.message}`,
        'query_failed',
        500
      );
    }

    if (existing) {
      return new Response(
        JSON.stringify({
          error: {
            message: `An active print job already exists for this student (status=${existing.status}). Wait for it to complete or be cancelled.`,
            code: 'duplicate_active_job'
          },
          data: existing as IdCardPrintJob
        }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      );
    }

    const { data: inserted, error: insertError } = await auth.supabase
      .from('id_card_print_jobs')
      .insert({
        student_id,
        template_id,
        status: 'pending' as IdCardPrintJobStatus,
        enqueued_by: auth.userId
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[id-cards/jobs] POST insert error:', insertError);
      return jsonError(
        `Failed to enqueue print job: ${insertError.message}`,
        'insert_failed',
        500
      );
    }

    return jsonOk<IdCardPrintJob>(inserted as IdCardPrintJob, 201);
  } catch (err) {
    console.error('[id-cards/jobs] POST unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    // Either a user with a job-reader role OR a valid agent token may list jobs.
    const auth = await requireUserOrAgent(request, JOB_READER_ROLES);
    if (isAuthFailure(auth)) return jsonError(auth.message, 'forbidden', auth.status);

    const url = new URL(request.url);
    const parsed = getQuerySchema.safeParse({
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined
    });
    if (!parsed.success) {
      return jsonError(
        `Invalid query: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        'bad_request',
        400
      );
    }

    // Agent path has no Supabase session — use service-role for the read.
    // User path uses the session-bound client we already opened in requireUser.
    const supabase =
      auth.kind === 'user' ? auth.supabase : createServiceRoleClient();

    let query = supabase
      .from('id_card_print_jobs')
      .select('*')
      .order('enqueued_at', { ascending: true })
      .limit(parsed.data.limit);

    if (parsed.data.status) {
      query = query.eq('status', parsed.data.status);
    } else {
      // No explicit filter → default to anything not yet terminal so polling agents
      // don't wade through the printed/failed history every poll.
      query = query.in('status', ACTIVE_STATUSES as IdCardPrintJobStatus[]);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[id-cards/jobs] GET error:', error);
      return jsonError(`Failed to list jobs: ${error.message}`, 'query_failed', 500);
    }

    return jsonOk<IdCardPrintJob[]>((data ?? []) as IdCardPrintJob[]);
  } catch (err) {
    console.error('[id-cards/jobs] GET unexpected:', err);
    return jsonError('Unexpected server error', 'internal_error', 500);
  }
}

