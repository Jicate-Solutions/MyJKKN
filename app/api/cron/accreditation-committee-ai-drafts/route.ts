// =====================================================================
// Accreditation — AI committee assistant (₹0 Max lane, DARK)
// =====================================================================
// One nightly pass that takes the desk work off a committee convener:
//
//   1. COLLECT finished draft jobs, run every deterministic gate on the model
//      text, and record the verdicts:
//        * grounding-validator     → did it state a fact the rows cannot back?
//        * agenda-doctrine-gate    → did a platform-readable figure land on the
//                                    AGENDA (as opposed to the brief)?
//        * findOmittedResolutions  → did the minutes polish DROP a resolution?
//   2. ENQUEUE an agenda draft for every scheduled sitting inside the lead
//      window, and a minutes polish for every held sitting with decisions.
//   3. PROPOSE a sitting for every committee overdue by its configured cadence.
//      Computed deterministically in SQL — a date and an attendee list are
//      precisely the things a model must never invent, so no model is asked.
//
// NOTHING HERE NOTIFIES OR INVITES ANYONE. A proposal is a row on the
// committee's own page that a convener must Confirm; only
// fn_accreditation_meeting_proposal_confirm creates a meeting, and it writes
// accreditation_committee_meetings and nothing else. The Universal Booking
// engine (meeting_bookings + the webhook dispatcher + calendar sync), which
// does invite real people, is never touched.
//
// DARK: both ai_job_types rows are enabled=false, so fn_ai_enqueue_system
// refuses every enqueue → nothing runs. This route is a safe no-op until the
// Director flips enabled=true (no deploy). The proposal pass has its own switch
// (accreditation.meeting.proposal_enabled, default false) read inside the RPC.
//
// Auth: CRON_SECRET via Authorization: Bearer <secret> ONLY (constant-time).
// Does not call Claude directly — the external Max-lane drain runs the model.
// Dispatch: the AI-routine dispatcher (ai_routine_schedules row
// 'accreditation-committee-ai-drafts'), NOT a raw vercel.json cron.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { collectJobsLane, enqueueJobsLane } from '@/lib/services/platform/ai-jobs-lane';
import { validateGrounding } from '@/lib/services/accreditation/grounding-validator';
import { checkAgendaDoctrine } from '@/lib/services/accreditation/agenda-doctrine-gate';
import {
  agendaEvidenceRows,
  buildAgendaPrompt,
  buildMinutesPolishPrompt,
  findOmittedResolutions,
  getAgendaFactSet,
  getMinutesFactSet,
  minutesEvidenceRows,
  splitBriefOutput,
} from '@/lib/services/accreditation/meeting-draft-service';

const AGENDA_JOB = 'accreditation.cac_brief';
const MINUTES_JOB = 'accreditation.meeting_minutes_polish';
const COLLECT_BATCH = 25;
const ENQUEUE_BATCH = 25;
const PROPOSAL_BATCH = 25;

interface DraftCtx {
  meeting_id?: string;
  committee_id?: string;
  draft_kind?: 'agenda' | 'minutes';
  structural_minutes?: string;
}

function bearerMatches(authHeader: string | null, secret: string): boolean {
  const presented = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Read the text from a synthesized Max-lane message (content[].type==='text'). */
function readMessageText(msg: unknown): string | null {
  const content = (msg as { content?: Array<{ type?: string; text?: string }> } | null)?.content;
  if (!Array.isArray(content)) return null;
  const t = content.find((c) => c?.type === 'text')?.text;
  return typeof t === 'string' && t.trim() ? t.trim() : null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || !bearerMatches(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const summary = {
    collected: 0,
    recorded: 0,
    grounded: 0,
    ungrounded: 0,
    doctrineBlocked: 0,
    omissionBlocked: 0,
    enqueuedAgenda: 0,
    enqueuedMinutes: 0,
    proposed: 0,
    skipped: 0,
    errors: 0,
  };

  // ── 1) COLLECT: gate + record any finished drafts ───────────────────────────
  try {
    const collected = await collectJobsLane(admin, [AGENDA_JOB, MINUTES_JOB], COLLECT_BATCH);
    summary.collected = collected.length;
    for (const item of collected) {
      try {
        const ctx = item.context as DraftCtx;
        const text = readMessageText(item.message);
        if (!ctx.meeting_id || !ctx.committee_id || !text) {
          summary.skipped++;
          continue;
        }
        const kind: 'agenda' | 'minutes' =
          ctx.draft_kind === 'minutes' || item.jobType === MINUTES_JOB ? 'minutes' : 'agenda';

        let sourceFacts: unknown = {};
        let verdictTokens: string[] = [];
        let verdict: 'grounded' | 'ungrounded' = 'ungrounded';
        let doctrineHits: unknown[] = [];
        let omitted: string[] = [];

        if (kind === 'agenda') {
          const facts = await getAgendaFactSet(admin, {
            meetingId: ctx.meeting_id,
            committeeId: ctx.committee_id,
          });
          if (!facts) {
            summary.skipped++;
            continue;
          }
          sourceFacts = facts;
          const rows = agendaEvidenceRows(facts);
          // Grounding runs on the WHOLE three-part output: the brief is where
          // figures belong, and they still have to be real.
          const gv = validateGrounding(text, rows, {
            period: facts.meeting.scheduled_for ?? undefined,
            scopeLabel: facts.committee.institution_name,
            metricName: facts.committee.committee_name,
          });
          verdict = gv.verdict;
          verdictTokens = gv.ungroundedTokens;
          // The doctrine gate runs on the AGENDA section ONLY.
          const parts = splitBriefOutput(text);
          const doctrine = checkAgendaDoctrine(parts.agenda);
          doctrineHits = doctrine.hits;
          if (!doctrine.ok) summary.doctrineBlocked++;
        } else {
          const facts = await getMinutesFactSet(admin, {
            meetingId: ctx.meeting_id,
            committeeId: ctx.committee_id,
            structuralMinutes: ctx.structural_minutes ?? '',
          });
          if (!facts) {
            summary.skipped++;
            continue;
          }
          sourceFacts = facts;
          const gv = validateGrounding(text, minutesEvidenceRows(facts), {
            period: facts.meeting.held_at ?? facts.meeting.scheduled_for ?? undefined,
            scopeLabel: facts.committee.institution_name,
            metricName: facts.committee.committee_name,
          });
          verdict = gv.verdict;
          verdictTokens = gv.ungroundedTokens;
          omitted = findOmittedResolutions(text, [...facts.reviewed, ...facts.passed]);
          if (omitted.length > 0) summary.omissionBlocked++;
        }

        const { error: recErr } = await admin.rpc('fn_accreditation_record_meeting_draft', {
          p_meeting_id: ctx.meeting_id,
          p_draft_kind: kind,
          p_body_md: text,
          p_source_facts: sourceFacts,
          p_grounding_verdict: verdict,
          p_ungrounded_tokens: verdictTokens,
          p_forbidden_number_hits: doctrineHits,
          p_omitted_resolution_ids: omitted,
          p_model: 'max-lane',
          p_ai_job_id: item.jobId,
        });
        if (recErr) {
          summary.errors++;
          console.error('[committee-ai] record failed:', recErr.message);
          continue;
        }
        summary.recorded++;
        verdict === 'grounded' ? summary.grounded++ : summary.ungrounded++;
      } catch (e) {
        summary.errors++;
        console.error('[committee-ai] collect item failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[committee-ai] collect phase failed:', e instanceof Error ? e.message : e);
  }

  // ── 2) ENQUEUE agenda drafts (scheduled sittings inside the lead window) ────
  // While DARK, fn_ai_enqueue_system returns unknown/disabled → enqueueJobsLane
  // reports ok:false and nothing is queued. That is expected.
  try {
    const { data: awaiting, error } = await admin.rpc('fn_accreditation_meeting_draft_awaiting', {
      p_kind: 'agenda',
      p_limit: ENQUEUE_BATCH,
    });
    if (error) throw new Error(error.message);
    for (const row of (awaiting ?? []) as Array<{ meeting_id: string; committee_id: string }>) {
      try {
        const facts = await getAgendaFactSet(admin, {
          meetingId: row.meeting_id,
          committeeId: row.committee_id,
        });
        if (!facts) {
          summary.skipped++;
          continue;
        }
        const res = await enqueueJobsLane(admin, {
          jobType: AGENDA_JOB,
          prompt: buildAgendaPrompt(facts),
          context: {
            meeting_id: row.meeting_id,
            committee_id: row.committee_id,
            draft_kind: 'agenda',
          },
          dedupeKey: `agenda:${row.meeting_id}`,
        });
        if (res.ok) summary.enqueuedAgenda++;
        else summary.skipped++; // dark (unknown_type) or in_flight → expected
      } catch (e) {
        summary.errors++;
        console.error('[committee-ai] agenda enqueue failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[committee-ai] agenda phase failed:', e instanceof Error ? e.message : e);
  }

  // ── 3) ENQUEUE minutes polish (held sittings with decisions entered) ────────
  try {
    const { data: awaiting, error } = await admin.rpc('fn_accreditation_meeting_draft_awaiting', {
      p_kind: 'minutes',
      p_limit: ENQUEUE_BATCH,
    });
    if (error) throw new Error(error.message);
    for (const row of (awaiting ?? []) as Array<{ meeting_id: string; committee_id: string }>) {
      try {
        // structuralMinutes omitted → rebuilt deterministically from the entered
        // rows (a held meeting has minutes_summary = NULL until it is closed).
        const facts = await getMinutesFactSet(admin, {
          meetingId: row.meeting_id,
          committeeId: row.committee_id,
        });
        if (!facts || (facts.reviewed.length === 0 && facts.passed.length === 0)) {
          summary.skipped++;
          continue;
        }
        const res = await enqueueJobsLane(admin, {
          jobType: MINUTES_JOB,
          prompt: buildMinutesPolishPrompt(facts),
          context: {
            meeting_id: row.meeting_id,
            committee_id: row.committee_id,
            draft_kind: 'minutes',
            structural_minutes: facts.structuralMinutes,
          },
          dedupeKey: `minutes:${row.meeting_id}`,
        });
        if (res.ok) summary.enqueuedMinutes++;
        else summary.skipped++;
      } catch (e) {
        summary.errors++;
        console.error('[committee-ai] minutes enqueue failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[committee-ai] minutes phase failed:', e instanceof Error ? e.message : e);
  }

  // ── 4) PROPOSE overdue sittings (deterministic; no model, no notification) ──
  try {
    const { data: due, error } = await admin.rpc('fn_accreditation_meeting_proposal_awaiting', {
      p_limit: PROPOSAL_BATCH,
    });
    if (error) throw new Error(error.message);
    for (const row of (due ?? []) as Array<{
      committee_id: string;
      proposed_for: string;
      member_ids: string[];
      last_sitting: string | null;
      cadence_days: number;
    }>) {
      try {
        const rationale = row.last_sitting
          ? `Last sitting was ${row.last_sitting}; the configured cadence is ${row.cadence_days} days, so a sitting is due. Nothing has been sent to anyone — confirm to put it on the calendar.`
          : `No sitting has been recorded yet and the configured cadence is ${row.cadence_days} days. Nothing has been sent to anyone — confirm to put it on the calendar.`;
        const { error: recErr } = await admin.rpc('fn_accreditation_record_meeting_proposal', {
          p_committee_id: row.committee_id,
          p_proposed_for: row.proposed_for,
          p_member_ids: row.member_ids ?? [],
          p_rationale: rationale,
        });
        if (recErr) {
          summary.skipped++; // the one-pending-per-committee index is the guard
          continue;
        }
        summary.proposed++;
      } catch (e) {
        summary.errors++;
        console.error('[committee-ai] proposal failed:', e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error('[committee-ai] proposal phase failed:', e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, ...summary });
}
