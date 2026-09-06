export const dynamic = 'force-dynamic';

// /api/id-cards/jobs
// Phase 1C — print-job queue endpoints.
//
// POST  — enqueue a print job for a (profile_id, template_id). Universal: the
//         person may be a learner or an employee (profiles anchor).
//         Roles: super_admin / registrar / admission.
//         Rejects duplicates (existing pending|rendering|sent_to_agent for same person) → 409.
//         Rejects a person who has LEFT (learner lifecycle status / team-member
//         active flag) → 422, a person with NO INSTITUTIONAL PHOTOGRAPH on file
//         → 422 (a login-account picture does not qualify and there is no
//         override), and a replacement card that is unpriced or whose charge
//         has not been accepted → 409. See
//         lib/services/id-cards/reprint-eligibility.ts for all three rules.
//
// GET   — list jobs, filter by status, paginated by limit (default 50, max 200).
//         Reachable from EITHER a user session (super_admin / registrar / admission)
//         OR an agent-token (Bearer ${AGENT_PRINT_TOKEN}). Agent uses this to poll for work.

import { NextRequest, after, connection } from 'next/server';
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
import {
  countPriorPrintedCards,
  describeReplacement,
  judgeCardPhoto,
  judgeCardSubject,
  judgeReplacement,
  lookupCardSubject,
  readReplacementPolicy
} from '@/lib/services/id-cards/reprint-eligibility';

const ACTIVE_STATUSES: IdCardPrintJobStatus[] = ['pending', 'rendering', 'sent_to_agent'];

const postBodySchema = z.object({
  profile_id: z.string().uuid(),
  template_id: z.string().uuid(),
  // Opt-in acknowledgement that a replacement card carries a fee. Absent on
  // every first card, so the existing callers are unaffected.
  replacement_fee_acknowledged: z.boolean().optional().default(false)
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

    const { profile_id, template_id, replacement_fee_acknowledged } = parsed.data;

    // Reject duplicate active job for the same person.
    const { data: existing, error: dupeError } = await auth.supabase
      .from('id_card_print_jobs')
      .select('*')
      .eq('profile_id', profile_id)
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
            message: `An active print job already exists for this person (status=${existing.status}). Wait for it to complete or be cancelled.`,
            code: 'duplicate_active_job'
          },
          data: existing as IdCardPrintJob
        }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      );
    }

    // GUARD 1 — a person who has left never reaches the printer.
    // The batch-print screen already filters its cohort, but that filter is in
    // the browser; this POST is reachable directly. Refusals are explicit and
    // say WHY (CLAUDE.md #27) — never a silent skip.
    const subjectLookup = await lookupCardSubject(auth.supabase, profile_id);
    if (subjectLookup.kind === 'error') {
      const status =
        subjectLookup.code === 'profile_not_found'
          ? 404
          : subjectLookup.code === 'query_failed'
            ? 500
            : 422;
      return jsonError(subjectLookup.message, subjectLookup.code, status);
    }

    const policy = await readReplacementPolicy(auth.supabase, subjectLookup.institutionId);

    const eligibility = judgeCardSubject(subjectLookup.subject, policy.allowedLearnerStatuses);
    if (eligibility.kind === 'refused') {
      return jsonError(eligibility.message, eligibility.code, 422);
    }

    // GUARD 3 — a card with no institutional photograph never reaches the
    // printer. Runs BEFORE the fee guard deliberately: an un-overridable
    // refusal must resolve before anyone is asked for ₹200, or a person pays
    // and only then learns the card was never printable.
    // Photo column came back with the subject lookup — no extra query.
    const photoGate = judgeCardPhoto({
      photo: subjectLookup.photo,
      required: policy.photoRequired
    });

    if (photoGate.kind === 'refused') {
      return jsonError(photoGate.message, photoGate.code, 422);
    }

    // GUARD 2 — the first card is free; a replacement is counted and chargeable.
    // The person's own PRINTED rows are the count; no extra column is needed.
    const priorPrinted = await countPriorPrintedCards(auth.supabase, profile_id);
    if (priorPrinted.kind === 'error') {
      console.error('[id-cards/jobs] POST prior-print count error:', priorPrinted.message);
      return jsonError(
        `Failed to count previous cards for this person: ${priorPrinted.message}`,
        'query_failed',
        500
      );
    }

    const replacement = judgeReplacement({
      priorPrintedCount: priorPrinted.count,
      freeCardCount: policy.freeCardCount,
      feeAmount: policy.feeAmount,
      feeCurrency: policy.feeCurrency,
      acknowledged: replacement_fee_acknowledged
    });

    if (replacement.kind === 'fee_not_configured' || replacement.kind === 'fee_required') {
      return new Response(
        JSON.stringify({
          error: {
            message: describeReplacement(replacement),
            code:
              replacement.kind === 'fee_not_configured'
                ? 'replacement_fee_not_configured'
                : 'replacement_fee_required'
          },
          data: {
            prior_printed_count: priorPrinted.count,
            free_card_count: policy.freeCardCount,
            replacement_number: replacement.replacementNumber,
            fee_amount: replacement.kind === 'fee_required' ? replacement.feeAmount : null,
            fee_currency: policy.feeCurrency
          }
        }),
        { status: 409, headers: { 'content-type': 'application/json' } }
      );
    }

    const { data: inserted, error: insertError } = await auth.supabase
      .from('id_card_print_jobs')
      .insert({
        profile_id,
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

    // A chargeable replacement reports what is owed alongside the job. Additive:
    // `data` is still the job row, so existing callers are unaffected.
    if (replacement.kind === 'chargeable') {
      return new Response(
        JSON.stringify({
          data: inserted as IdCardPrintJob,
          replacement: {
            replacement_number: replacement.replacementNumber,
            fee_amount: replacement.feeAmount,
            fee_currency: replacement.feeCurrency,
            message: describeReplacement(replacement)
          }
        }),
        { status: 201, headers: { 'content-type': 'application/json' } }
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

    // Bridge heartbeat — record that the print bridge polled, so the print
    // queue UI can show "Print bridge online / silent". Fire-and-forget via
    // after() (runs once the response is sent, serverless-safe), and EVERY
    // failure — including id_card_agent_status not existing yet, so deploy
    // order never matters — is swallowed with at most a console.warn.
    // Polling must never fail because of the heartbeat.
    if (auth.kind === 'agent') {
      after(async () => {
        try {
          const now = new Date().toISOString();
          const { error } = await createServiceRoleClient()
            .from('id_card_agent_status')
            .update({ last_poll_at: now, updated_at: now })
            .eq('id', 1);
          if (error) {
            console.warn('[id-cards/jobs] heartbeat skipped:', error.message);
          }
        } catch (err) {
          console.warn('[id-cards/jobs] heartbeat skipped:', err);
        }
      });
    }

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

