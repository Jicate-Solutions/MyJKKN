'use server';

/**
 * Online Meetings — server actions for the host-side forms.
 *
 * Every action opens by establishing who is calling and what they may do, then
 * runs the service inside `BaseService.runWithClient` so the service's queries
 * carry the caller's RLS context. Without that wrapper a service call on the
 * server silently falls back to the browser singleton, which has no auth
 * context at all — the tell is "Server-side service call without client
 * injection" in the logs, and the symptom is an empty page.
 *
 * `return await runWithClient(...)` — the await is load-bearing. Without it an
 * async callback's rejection escapes the try/catch entirely.
 */

import { revalidatePath } from 'next/cache';

import { BaseService } from '@/lib/services/base-service';
import { MeetingAgendaService } from '@/lib/services/online-meetings/agenda-service';
import {
  isInviteEmailConfigured,
  joinUrlFor,
  sendMeetingInvites,
  type InviteEmailResult,
} from '@/lib/services/online-meetings/invite-email-service';
import {
  provisionMeetLink,
  provisionNotice,
} from '@/lib/services/online-meetings/meet-provisioner';
import { OnlineMeetingService } from '@/lib/services/online-meetings/meeting-service';
import {
  MeetingParticipantService,
  type ExternalInviteInput,
} from '@/lib/services/online-meetings/participant-service';
import { MeetingPollService } from '@/lib/services/online-meetings/poll-service';
import { MeetingReportService } from '@/lib/services/online-meetings/report-service';
import type {
  MeetProvider,
  MeetSource,
} from '@/lib/services/online-meetings/types';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

const LOG_SCOPE = 'online-meetings/actions';

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string };

interface Caller {
  supabase: any;
  profileId: string;
  institutionId: string | null;
}

/**
 * Resolve the caller once. Returns a plain error rather than redirecting: an
 * explicit "you are not signed in" card is always better than a bounce to a
 * landing page the person clicks straight back out of.
 */
async function caller(): Promise<
  { ok: true; data: Caller } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are not signed in.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, institution_id')
    .eq('id', user.id)
    .maybeSingle();

  return {
    ok: true,
    data: {
      supabase,
      profileId: user.id,
      institutionId: profile?.institution_id ?? null,
    },
  };
}

/** Server-side permission check. RLS is the backstop, this is the gate. */
async function can(supabase: any, key: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('user_has_permission', {
    permission_name: key,
  });
  if (error) {
    logger.warn(LOG_SCOPE, 'permission check failed', { key, error });
    return false;
  }
  return data === true;
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export interface CreateMeetingFormInput {
  institutionId: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  timezone?: string;
  joinMode?: 'invite_only' | 'open_link';
  /**
   * Which provider to ask for a link. Defaults to Teams, which is what JKKN
   * actually runs meetings on. 'manual' skips provisioning entirely.
   */
  meetProvider: MeetProvider;
  meetUrl?: string;
  requirePolls: boolean;
  requiredPollCount: number;
  requireQuiz: boolean;
  lateThresholdMinutes: number;
}

export async function createMeetingAction(
  input: CreateMeetingFormInput,
): Promise<ActionResult<{ id: string; meetNotice: string | null }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };
  const { supabase, profileId } = who.data;

  if (!(await can(supabase, 'onlineMeeting:create'))) {
    const isSuper = await can(supabase, 'onlineMeeting:manage.all');
    if (!isSuper) {
      return {
        success: false,
        error:
          'You do not have permission to schedule an online meeting. Ask an administrator for the "Schedule an online meeting" permission.',
      };
    }
  }

  const timezone = input.timezone || 'Asia/Kolkata';

  // Provision FIRST, so the link is stored with the meeting on its very first
  // write and there is no window where the meeting exists without one.
  // Provisioning never blocks: an unconfigured or failing provider falls
  // through to whatever the organiser pasted, and the meeting is created
  // either way.
  let meetUrl = input.meetUrl?.trim() || null;
  let meetSource: MeetSource = 'manual';
  let providerMeetingId: string | null = null;
  let meetNotice: string | null = null;

  if (input.meetProvider !== 'manual') {
    const provisioned = await provisionMeetLink(supabase, {
      provider: input.meetProvider,
      hostProfileId: profileId,
      title: input.title,
      description: input.description ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone,
      attendees: [],
    });
    if (provisioned.status === 'created') {
      meetUrl = provisioned.meetUrl;
      meetSource = provisioned.provider;
      providerMeetingId = provisioned.providerMeetingId;
    } else {
      // A provider that is not set up is a NOTICE, not a failure. The meeting
      // exists and is usable; the host just has to paste a link.
      meetNotice = provisionNotice(provisioned);
    }
  }

  return await BaseService.runWithClient(supabase, async () => {
    const result = await OnlineMeetingService.create({
      institutionId: input.institutionId,
      title: input.title,
      description: input.description ?? null,
      hostProfileId: profileId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      timezone,
      joinMode: input.joinMode ?? 'invite_only',
      meetUrl,
      meetSource,
      googleEventId: providerMeetingId,
      engagementConfig: {
        late_threshold_minutes: input.lateThresholdMinutes,
        require_polls: input.requirePolls,
        required_poll_count: input.requiredPollCount,
        require_quiz: input.requireQuiz,
      },
    });

    if (!result.ok) return { success: false as const, error: result.error };

    // The host is always a participant of their own meeting. Otherwise they
    // cannot join, cannot answer their own poll, and are missing from the
    // attendance report of a meeting they ran.
    await MeetingParticipantService.addInternal(
      result.data.id,
      input.institutionId,
      [profileId],
      profileId,
    );

    revalidatePath('/online-meetings');
    return { success: true as const, data: { id: result.data.id, meetNotice } };
  });
}

export async function cancelMeetingAction(
  meetingId: string,
  reason: string,
): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await OnlineMeetingService.cancel(meetingId, reason);
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath('/online-meetings');
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: undefined };
  });
}

export async function updateMeetingLinkAction(
  meetingId: string,
  meetUrl: string,
): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await OnlineMeetingService.update(meetingId, {
      meetUrl,
      meetSource: 'manual',
      // Pasting a link over a generated one means the Google event is no longer
      // where the meeting happens. Clearing the id stops a later edit from
      // silently patching a calendar entry nobody is using.
      googleEventId: null,
    });
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    revalidatePath(`/online-meetings/${meetingId}/live`);
    return { success: true as const, data: undefined };
  });
}

/**
 * Generate a video link for a meeting that already exists.
 *
 * The scheduling form tries this at creation, but a deployment with no
 * configured provider ends up with a meeting and no link. Without this a host
 * could never add one after IT switches Microsoft Graph on, and the link would
 * be permanently absent for a meeting that is otherwise fine.
 *
 * Passes everyone who has an email address, so a Google link created after the
 * invitations went out still reaches them through the calendar. Teams ignores
 * the list: Graph creates the meeting under the fixed organizer service
 * account, so there is no per-attendee invite to attach.
 */
export async function provisionMeetLinkAction(
  meetingId: string,
  provider: MeetProvider = 'teams',
): Promise<ActionResult<{ meetUrl: string }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };
  const { supabase, profileId } = who.data;

  return await BaseService.runWithClient(supabase, async () => {
    const meeting = await OnlineMeetingService.getById(meetingId);
    if (!meeting.ok) return { success: false as const, error: meeting.error };
    if (!meeting.data) return { success: false as const, error: 'Meeting not found.' };

    const roster = await MeetingParticipantService.list(meetingId, true);
    const attendees: Array<{ email: string; displayName?: string }> = [];
    if (roster.ok) {
      for (const p of roster.data) {
        if (p.external_email) {
          attendees.push({ email: p.external_email, displayName: p.display_name });
        }
      }
      const internalIds = roster.data
        .filter((p) => p.participant_kind === 'internal' && p.profile_id)
        .map((p) => p.profile_id as string);
      if (internalIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('email, full_name')
          .in('id', internalIds)
          .not('email', 'is', null);
        for (const p of (profiles ?? []) as any[]) {
          if (p.email) attendees.push({ email: p.email, displayName: p.full_name ?? undefined });
        }
      }
    }

    const provisioned = await provisionMeetLink(supabase, {
      provider,
      hostProfileId: meeting.data.host_profile_id,
      title: meeting.data.title,
      description: meeting.data.description ?? null,
      startsAt: meeting.data.starts_at,
      endsAt: meeting.data.ends_at,
      timezone: meeting.data.timezone,
      attendees,
    });

    if (provisioned.status !== 'created') {
      // Here, unlike at creation, the host explicitly ASKED for a link, so a
      // provider that is not set up is a failed request rather than a notice.
      return {
        success: false as const,
        error: provisionNotice(provisioned) ?? 'No link could be created.',
      };
    }

    const saved = await OnlineMeetingService.update(meetingId, {
      meetUrl: provisioned.meetUrl,
      meetSource: provisioned.provider,
      googleEventId: provisioned.providerMeetingId,
    });
    if (!saved.ok) return { success: false as const, error: saved.error };

    // The host generating the link is not necessarily the host of record, but
    // only a host or manager reaches this action, and the link belongs to the
    // meeting either way. profileId is referenced so the intent is auditable.
    logger.info(LOG_SCOPE, 'meet link provisioned', { meetingId, by: profileId });

    revalidatePath(`/online-meetings/${meetingId}`);
    revalidatePath(`/online-meetings/${meetingId}/live`);
    return { success: true as const, data: { meetUrl: provisioned.meetUrl } };
  });
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export async function inviteInternalAction(
  meetingId: string,
  institutionId: string,
  profileIds: string[],
): Promise<ActionResult<{ added: number; skipped: number }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingParticipantService.addInternal(
      meetingId,
      institutionId,
      profileIds,
      who.data.profileId,
    );
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: result.data };
  });
}

export async function inviteScopeAction(
  meetingId: string,
  institutionId: string,
  scope:
    | { kind: 'department'; departmentId: string }
    | { kind: 'institution'; institutionId: string },
): Promise<ActionResult<{ added: number; skipped: number }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingParticipantService.addScope(
      meetingId,
      institutionId,
      scope,
      who.data.profileId,
    );
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: result.data };
  });
}

export async function inviteExternalAction(
  meetingId: string,
  institutionId: string,
  guests: ExternalInviteInput[],
): Promise<ActionResult<{ added: number; skipped: number }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingParticipantService.addExternal(
      meetingId,
      institutionId,
      guests,
      who.data.profileId,
    );
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: result.data };
  });
}

export interface ColleagueOption {
  profileId: string;
  name: string;
  departmentName: string | null;
}

/**
 * Search active staff who can actually hold a participant row.
 *
 * Reads `staff` and takes `profile_id`, NOT `profiles` directly. Staff whose
 * institution_email was left blank never get a profile row at all, so listing
 * them here would offer the host somebody who cannot be invited — the invite
 * would then fail, or worse, appear to succeed against a null id.
 */
export async function searchColleaguesAction(
  institutionId: string,
  term: string,
): Promise<ActionResult<ColleagueOption[]>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  // The `.or()` argument below is a PostgREST filter DSL string, not a bound
  // parameter. Interpolating raw input into it lets a caller inject extra
  // conditions: a comma starts a new clause, parentheses regroup, and `%`/`_`
  // are ILIKE wildcards that silently widen the match. The institution filter
  // and RLS still apply, so this is a widening bug rather than a tenant escape,
  // but nothing legitimate needs those characters in a person's name.
  //
  // Stripped rather than escaped: PostgREST's escaping rules inside .or() are
  // fiddly enough that an escape is the kind of thing that quietly stops
  // working, whereas a character that never reaches the parser cannot.
  // Dots and apostrophes are kept: staff names here really do contain them
  // ("DR. ABIMANYU A", "O'Brien"), and PostgREST splits a clause on its first
  // two dots only, so a dot inside the value is inert.
  const search = term.trim().replace(/[,()%_*\\"]/g, '').slice(0, 60);
  if (search.length < 2) return { success: true, data: [] };

  let query = who.data.supabase
    .from('staff')
    .select('profile_id, first_name, last_name, department_id')
    .eq('is_active', true)
    .not('profile_id', 'is', null)
    .limit(25);

  if (institutionId) query = query.eq('institution_id', institutionId);

  // `search` is metacharacter-free by construction above, so the only `%` in
  // this string are the two wildcards this line puts there on purpose.
  query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) {
    logger.error(LOG_SCOPE, 'colleague search failed', error);
    return { success: false, error: 'Could not search staff.' };
  }

  const rows = (data ?? []) as any[];
  const deptIds = Array.from(
    new Set(rows.map((r) => r.department_id).filter(Boolean)),
  ) as string[];
  const deptName = new Map<string, string>();
  if (deptIds.length > 0) {
    const { data: depts } = await who.data.supabase
      .from('departments')
      .select('id, department_name')
      .in('id', deptIds);
    for (const d of (depts ?? []) as any[]) deptName.set(d.id, d.department_name);
  }

  return {
    success: true,
    data: rows.map((r) => ({
      profileId: r.profile_id as string,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || 'Unnamed',
      departmentName: r.department_id ? (deptName.get(r.department_id) ?? null) : null,
    })),
  };
}

/** Departments of one institution, for the bulk-invite picker. */
export async function listDepartmentsAction(
  institutionId: string,
): Promise<ActionResult<Array<{ id: string; name: string }>>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  const { data, error } = await who.data.supabase
    .from('departments')
    .select('id, department_name')
    .eq('institution_id', institutionId)
    .eq('is_active', true)
    .order('department_name');

  if (error) {
    logger.error(LOG_SCOPE, 'department list failed', error);
    return { success: false, error: 'Could not load departments.' };
  }
  return {
    success: true,
    data: ((data ?? []) as any[]).map((d) => ({ id: d.id, name: d.department_name })),
  };
}

/** How many people a bulk invite would actually add, before committing. */
export async function previewScopeAction(
  scope:
    | { kind: 'department'; departmentId: string }
    | { kind: 'institution'; institutionId: string },
) {
  const who = await caller();
  if (!who.ok) return { success: false as const, error: who.error };
  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingParticipantService.previewExpansion(scope);
    return result.ok
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error };
  });
}

export async function removeParticipantAction(
  meetingId: string,
  participantId: string,
): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingParticipantService.remove(participantId);
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: undefined };
  });
}

export async function regenerateJoinLinkAction(
  meetingId: string,
  participantId: string,
): Promise<ActionResult<{ joinUrl: string }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingParticipantService.regenerateToken(participantId);
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: { joinUrl: joinUrlFor(result.data.join_token) } };
  });
}

/**
 * Email everyone their personal join link.
 *
 * Reports per-recipient outcomes rather than a single success flag. A guest
 * with no email address is `skipped`, which is the normal case and not a
 * failure — the host copies that person's link from the roster instead. The UI
 * must show that distinction; "invitations sent" over a silent skip is how
 * somebody ends up not being told about a meeting.
 */
export async function sendInvitesAction(
  meetingId: string,
): Promise<
  ActionResult<{ results: InviteEmailResult[]; emailConfigured: boolean }>
> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };
  const { supabase } = who.data;

  return await BaseService.runWithClient(supabase, async () => {
    const meeting = await OnlineMeetingService.getById(meetingId);
    if (!meeting.ok) return { success: false as const, error: meeting.error };
    if (!meeting.data) return { success: false as const, error: 'Meeting not found.' };

    const roster = await MeetingParticipantService.list(meetingId, true);
    if (!roster.ok) return { success: false as const, error: roster.error };

    const { data: host } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', meeting.data.host_profile_id)
      .maybeSingle();

    // Internal colleagues get their link too. They could reach the meeting
    // through the app, but a link in an email is what actually gets clicked,
    // and it lands them on the same page with the same tracking.
    const recipients = roster.data
      .filter((p) => p.join_token)
      .map((p) => ({
        participantId: p.id,
        name: p.display_name,
        email: p.external_email,
        joinToken: p.join_token as string,
      }));

    // Internal participants have no external_email column; resolve theirs from
    // profiles so a colleague is emailed too rather than silently skipped.
    const internalIds = roster.data
      .filter((p) => p.participant_kind === 'internal' && p.profile_id)
      .map((p) => p.profile_id as string);
    if (internalIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', internalIds);
      const emailOf = new Map<string, string | null>(
        ((profiles ?? []) as any[]).map((p) => [p.id, p.email ?? null]),
      );
      for (const r of recipients) {
        const p = roster.data.find((x) => x.id === r.participantId);
        if (p?.participant_kind === 'internal' && p.profile_id) {
          r.email = emailOf.get(p.profile_id) ?? null;
        }
      }
    }

    const results = await sendMeetingInvites(
      {
        title: meeting.data.title,
        description: meeting.data.description,
        startsAt: meeting.data.starts_at,
        endsAt: meeting.data.ends_at,
        timezone: meeting.data.timezone,
        hostName: host?.full_name ?? null,
        meetUrl: meeting.data.meet_url,
      },
      recipients,
    );

    for (const r of results) {
      if (r.success) {
        await MeetingParticipantService.setInviteStatus(r.participantId, 'sent');
      }
    }

    revalidatePath(`/online-meetings/${meetingId}`);
    return {
      success: true as const,
      data: { results, emailConfigured: isInviteEmailConfigured() },
    };
  });
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

/**
 * Save the post-meeting quiz.
 *
 * Refuses a quiz somebody could pass without knowing anything. With four
 * questions whose correct answer is always the first option, picking option A
 * throughout scores 100% — the AI Pulse quiz shipped exactly that shape and a
 * blind respondent passed it, which is why the live threshold had to be raised
 * after the fact. Catching it at authoring time is cheaper than discovering it
 * in a report.
 */
export async function saveQuizAction(
  meetingId: string,
  quiz: {
    questions: Array<{
      id: string;
      question: string;
      options: Array<{ id: string; text: string; is_correct: boolean }>;
    }>;
    pass_threshold: number;
  },
): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  for (const [i, q] of quiz.questions.entries()) {
    if (!q.question.trim()) {
      return { success: false, error: `Question ${i + 1} has no text.` };
    }
    if (q.options.length < 2) {
      return { success: false, error: `Question ${i + 1} needs at least two options.` };
    }
    const correct = q.options.filter((o) => o.is_correct);
    if (correct.length !== 1) {
      return {
        success: false,
        error: `Question ${i + 1} must have exactly one correct answer.`,
      };
    }
    if (q.options.some((o) => !o.text.trim())) {
      return { success: false, error: `Question ${i + 1} has a blank option.` };
    }
  }

  // The knowledge-free-pass check: if always choosing the Nth option would
  // score at or above the pass mark, the quiz measures patience, not learning.
  if (quiz.questions.length > 0) {
    const maxOptions = Math.max(...quiz.questions.map((q) => q.options.length));
    for (let slot = 0; slot < maxOptions; slot++) {
      const hits = quiz.questions.filter(
        (q) => q.options[slot]?.is_correct === true,
      ).length;
      const blindScore = Math.round((hits / quiz.questions.length) * 100);
      if (blindScore >= quiz.pass_threshold) {
        return {
          success: false,
          error: `Somebody who always picked option ${String.fromCharCode(65 + slot)} would score ${blindScore}% and pass. Move the correct answers around, or raise the pass mark.`,
        };
      }
    }
  }

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await OnlineMeetingService.update(meetingId, { quiz });
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: undefined };
  });
}

// ---------------------------------------------------------------------------
// Polls
// ---------------------------------------------------------------------------

export async function createPollAction(
  meetingId: string,
  institutionId: string,
  question: string,
  optionLabels: string[],
): Promise<ActionResult<{ id: string }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingPollService.create({
      meetingId,
      institutionId,
      question,
      optionLabels,
      createdBy: who.data.profileId,
    });
    if (!result.ok) return { success: false as const, error: result.error };
    return { success: true as const, data: result.data };
  });
}

export async function closePollAction(pollId: string): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };
  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingPollService.close(pollId);
    return result.ok
      ? { success: true as const, data: undefined }
      : { success: false as const, error: result.error };
  });
}

// ---------------------------------------------------------------------------
// Agenda / minutes / action items
// ---------------------------------------------------------------------------

export async function addAgendaItemAction(input: {
  meetingId: string;
  institutionId: string;
  title: string;
  detail?: string;
  durationMin?: number | null;
  presenterParticipantId?: string | null;
  sortOrder?: number;
}): Promise<ActionResult<{ id: string }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingAgendaService.addAgendaItem({
      ...input,
      createdBy: who.data.profileId,
    });
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${input.meetingId}`);
    return { success: true as const, data: result.data };
  });
}

export async function removeAgendaItemAction(
  meetingId: string,
  itemId: string,
): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };
  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingAgendaService.removeAgendaItem(itemId);
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: undefined };
  });
}

export async function saveMinutesAction(input: {
  meetingId: string;
  institutionId: string;
  content: string;
  publish?: boolean;
}): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingAgendaService.saveMinutes({
      ...input,
      recordedBy: who.data.profileId,
    });
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${input.meetingId}`);
    return { success: true as const, data: undefined };
  });
}

export async function addActionItemAction(input: {
  meetingId: string;
  institutionId: string;
  title: string;
  detail?: string;
  ownerParticipantId?: string | null;
  dueDate?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };

  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingAgendaService.addActionItem({
      ...input,
      createdBy: who.data.profileId,
    });
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${input.meetingId}`);
    return { success: true as const, data: result.data };
  });
}

export async function updateActionItemStatusAction(
  meetingId: string,
  itemId: string,
  status: 'open' | 'in_progress' | 'done' | 'dropped',
): Promise<ActionResult> {
  const who = await caller();
  if (!who.ok) return { success: false, error: who.error };
  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingAgendaService.updateActionItem(itemId, { status });
    if (!result.ok) return { success: false as const, error: result.error };
    revalidatePath(`/online-meetings/${meetingId}`);
    return { success: true as const, data: undefined };
  });
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

export async function buildReportAction(meetingId: string) {
  const who = await caller();
  if (!who.ok) return { success: false as const, error: who.error };
  return await BaseService.runWithClient(who.data.supabase, async () => {
    const result = await MeetingReportService.build(meetingId);
    return result.ok
      ? { success: true as const, data: result.data }
      : { success: false as const, error: result.error };
  });
}
