'use server';

// app/(routes)/accreditation/naac/committees/[id]/_actions/meeting-ai-actions.ts
// ============================================================================
// The HUMAN GATE for the AI committee assistant. Three actions, one discipline
// (copied from okay-narrative.ts, which is already live):
//
//   okayMeetingDraft(id, editedMd)  — re-runs EVERY deterministic gate on the
//                                     text the human actually edited, then
//                                     advances the row.
//   discardMeetingDraft(id, note)   — throws the draft away.
//   respondToSittingProposal(...)   — confirm (creates the sitting) or decline.
//
// WHY re-run the gates here: the verdicts stored on the row were computed on the
// MODEL's text. A convener may edit before okaying, and an edit could introduce a
// figure onto the agenda, a fabricated date into a minute, or delete a resolution
// from the write-up. So the gates run again on the edited text; only text that
// passes all three reaches the state-machine RPC (which enforces them a second
// time against the stored verdicts, so no UI path can skip them).
//
// Client discipline (the load-bearing part):
//   * service-role client — READS ONLY (re-deriving the fact set). Never writes.
//   * session client      — CALLS the SECDEF RPC, so auth.uid() inside it is the
//                           acting convener and its permission +
//                           role_has_institution_access checks resolve against
//                           the real caller. Calling the RPC with the service-role
//                           client would make auth.uid() NULL and the permission
//                           checks would misfire.
//
// SCOPE (b) SAFETY: confirming a proposal calls
// fn_accreditation_meeting_proposal_confirm, which writes
// accreditation_committee_meetings and nothing else. No notification, no invite,
// no calendar write — verified on prod (the committee tables carry no INSERT or
// notify trigger, and no code path messages anyone). Declining writes a status
// and reaches nobody either.
// ============================================================================

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { validateGrounding } from '@/lib/services/accreditation/grounding-validator';
import {
  checkAgendaDoctrine,
  describeDoctrineHits,
} from '@/lib/services/accreditation/agenda-doctrine-gate';
import {
  agendaEvidenceRows,
  findOmittedResolutions,
  getAgendaFactSet,
  getMinutesFactSet,
  minutesEvidenceRows,
  splitBriefOutput,
} from '@/lib/services/accreditation/meeting-draft-service';

// Flat shape (not a discriminated union): the repo runs with
// strictNullChecks:false, under which boolean-discriminant narrowing does not
// work — so callers read the detail fields off the same object, guarded by `ok`.
export interface MeetingDraftActionResult {
  ok: boolean;
  error?: string;
  /** Facts the edited text asserts that the rows cannot account for. */
  ungroundedTokens?: string[];
  /** Platform-readable figures found on the AGENDA (scope-d doctrine). */
  doctrineMessage?: string;
  /** Resolutions the edited minutes dropped (scope-c completeness). */
  omittedCount?: number;
}

export interface SittingProposalActionResult {
  ok: boolean;
  error?: string;
  /** The meeting row the confirm created (absent on decline). */
  meetingId?: string;
}

/**
 * Okay an AI draft after (optionally) editing it. Refuses if the EDITED text
 * fails the grounding gate, the forbidden-agenda gate, or the omission check.
 */
export async function okayMeetingDraft(
  id: string,
  editedMd: string,
): Promise<MeetingDraftActionResult> {
  if (!id || typeof editedMd !== 'string' || editedMd.trim().length === 0) {
    return { ok: false, error: 'A non-empty draft is required to okay.' };
  }

  // ── 1) ACCESS GATE (session client, RLS): the caller must be able to SEE the
  // draft before we re-read any facts. Anyone who passes already sees the stored
  // verdicts on the panel, so recomputing them leaks nothing extra; a caller
  // without access is refused here, before any service-role read.
  const session = await createClient();
  const { data: row, error: rowErr } = await (session as any)
    .from('accreditation_meeting_drafts')
    .select('id, committee_id, meeting_id, draft_kind, status')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) return { ok: false, error: `Could not load the draft: ${rowErr.message}` };
  if (!row) {
    return {
      ok: false,
      error: 'Draft not found, or you do not have access to it. Contact your IQAC coordinator.',
    };
  }
  if (row.status !== 'ai_drafted') {
    return { ok: false, error: `This draft is already ${row.status.replace('_', ' ')}.` };
  }

  const admin = createServiceRoleClient();

  // ── 2) Re-derive the fact set and re-run every gate on the EDITED text ──────
  if (row.draft_kind === 'agenda') {
    const facts = await getAgendaFactSet(admin, {
      meetingId: row.meeting_id,
      committeeId: row.committee_id,
    });
    if (!facts) return { ok: false, error: 'The sitting this draft belongs to no longer exists.' };

    const gv = validateGrounding(editedMd, agendaEvidenceRows(facts), {
      period: facts.meeting.scheduled_for ?? undefined,
      scopeLabel: facts.committee.institution_name,
      metricName: facts.committee.committee_name,
    });
    if (gv.verdict === 'ungrounded') return { ok: false, ungroundedTokens: gv.ungroundedTokens };

    // The doctrine gate reads the AGENDA section only — the brief may carry
    // figures, the agenda may not.
    const doctrine = checkAgendaDoctrine(splitBriefOutput(editedMd).agenda);
    if (!doctrine.ok) {
      return { ok: false, doctrineMessage: describeDoctrineHits(doctrine.hits) };
    }
  } else {
    const facts = await getMinutesFactSet(admin, {
      meetingId: row.meeting_id,
      committeeId: row.committee_id,
    });
    if (!facts) return { ok: false, error: 'The sitting this draft belongs to no longer exists.' };

    const gv = validateGrounding(editedMd, minutesEvidenceRows(facts), {
      period: facts.meeting.held_at ?? facts.meeting.scheduled_for ?? undefined,
      scopeLabel: facts.committee.institution_name,
      metricName: facts.committee.committee_name,
    });
    if (gv.verdict === 'ungrounded') return { ok: false, ungroundedTokens: gv.ungroundedTokens };

    const omitted = findOmittedResolutions(editedMd, [...facts.reviewed, ...facts.passed]);
    if (omitted.length > 0) return { ok: false, omittedCount: omitted.length };
  }

  // ── 3) Every gate passed → advance via the RPC as the real caller ───────────
  const { error: rpcErr } = await (session as any).rpc(
    'fn_accreditation_meeting_draft_transition',
    { p_id: id, p_action: 'okay', p_edited_md: editedMd },
  );
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true };
}

/** Throw an AI draft away (the convener wants to write it themselves). */
export async function discardMeetingDraft(
  id: string,
  note?: string,
): Promise<MeetingDraftActionResult> {
  if (!id) return { ok: false, error: 'A draft id is required.' };
  const session = await createClient();
  const { error } = await (session as any).rpc('fn_accreditation_meeting_draft_transition', {
    p_id: id,
    p_action: 'discard',
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Confirm or decline a proposed sitting. CONFIRM is the ONLY path in this lane
 * that creates a real meeting row, and it is reached only by a human pressing
 * the button. Nothing is sent to anyone either way.
 */
export async function respondToSittingProposal(
  id: string,
  action: 'confirm' | 'decline',
  opts: { scheduledFor?: string | null; note?: string | null } = {},
): Promise<SittingProposalActionResult> {
  if (!id) return { ok: false, error: 'A proposal id is required.' };
  if (action !== 'confirm' && action !== 'decline') {
    return { ok: false, error: 'Unknown action.' };
  }
  const session = await createClient();
  const { data, error } = await (session as any).rpc(
    'fn_accreditation_meeting_proposal_confirm',
    {
      p_id: id,
      p_action: action,
      p_scheduled_for: action === 'confirm' ? opts.scheduledFor ?? null : null,
      p_note: action === 'decline' ? opts.note ?? null : null,
    },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, meetingId: typeof data === 'string' ? data : undefined };
}
