/**
 * Online Meetings — video link provisioning.
 *
 * TEAMS IS THE DEFAULT, AND THAT IS NOT A PREFERENCE
 *   Measured 2026-09-09: of the 16 AI Pulse cycles, 10 carry a meeting link and
 *   all 10 are Teams URLs. Every one was pasted by hand by the Champion,
 *   because nothing in the platform generates them. The Director's locked
 *   decision of 2026-06-18 is "Keep Teams", recorded in
 *   specs/ai-pulse-graph-attendance-integration-2026-06-18.md, and the reason
 *   is not only capacity: Graph exposes a meeting's real attendance report
 *   ONLY to its organizer, so a link the platform generated is the only kind
 *   whose attendance the platform can ever read back.
 *
 *   So this module asks Teams first, Google second, and falls back to a pasted
 *   URL. Nothing about that fallback is a failure state — it is what AI Pulse
 *   does today, and it is what happens on any deployment where IT has not yet
 *   delivered the credentials.
 *
 * NEITHER INTEGRATION IS CONFIGURED ON THIS DEPLOYMENT (checked 2026-09-09).
 *   All four MS_GRAPH_* values are empty, and so is GOOGLE_CAL_CLIENT_ID. That
 *   is precisely why the first test meeting came out with no link, and why the
 *   host MUST always have a way to paste one. When IT supplies the Graph
 *   values, every new meeting gets a Teams link with no code change here.
 *
 * PROVISIONING NEVER BLOCKS CREATION.
 *   Every path returns a result rather than throwing. A host scheduling a
 *   meeting that starts in ten minutes must not be stopped by an outage at
 *   Microsoft, a revoked Google token, or a missing environment variable.
 *
 * SERVER-ONLY. Both providers read secrets. Never import from a client
 * component.
 */

import { GoogleCalendarService } from '@/lib/services/integrations/google-calendar-service';
import {
  createTeamsMeeting,
  isTeamsConfigured,
} from '@/lib/services/integrations/teams-service';
import { logger } from '@/lib/utils/enhanced-logger';

import type { MeetProvider, MeetProvisionResult } from './types';

const LOG_SCOPE = 'online-meetings/meet';

export interface ProvisionMeetInput {
  /** Which provider the organiser asked for. */
  provider: MeetProvider;
  hostProfileId: string;
  title: string;
  description?: string | null;
  startsAt: string; // ISO
  endsAt: string; // ISO
  timezone: string;
  /**
   * Real email addresses only. Google invites these itself, which is a useful
   * side effect but NOT the invitation this module relies on: a calendar invite
   * carries the link, not the join token that makes a guest trackable. See
   * invite-email-service.ts.
   *
   * Teams ignores them. Graph creates the meeting under the fixed organizer
   * service account, so there is no per-attendee invite to attach.
   */
  attendees: Array<{ email: string; displayName?: string }>;
}

/** Is a given provider usable on this deployment right now? */
export function providerAvailability(googleConnected: boolean): Record<MeetProvider, boolean> {
  return {
    teams: isTeamsConfigured(),
    google: googleConnected,
    manual: true,
  };
}

export { isTeamsConfigured };

function durationMinutes(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 60;
  return Math.round(ms / 60_000);
}

/**
 * Ask the chosen provider for a link.
 *
 * Returns 'not_configured' when the provider simply is not set up. That is the
 * common case here and is not an error worth logging as one; the caller turns
 * it into a notice and lets the meeting exist without a link.
 */
export async function provisionMeetLink(
  supabase: any,
  input: ProvisionMeetInput,
): Promise<MeetProvisionResult> {
  if (input.provider === 'manual') return { status: 'not_configured', provider: 'manual' };
  if (input.provider === 'teams') return provisionTeams(input);
  return provisionGoogle(supabase, input);
}

async function provisionTeams(input: ProvisionMeetInput): Promise<MeetProvisionResult> {
  if (!isTeamsConfigured()) return { status: 'not_configured', provider: 'teams' };

  try {
    const created = await createTeamsMeeting({
      topic: input.title,
      startIso: input.startsAt,
      durationMin: durationMinutes(input.startsAt, input.endsAt),
      hostEmail: input.attendees[0]?.email,
    });

    // createTeamsMeeting already fails closed and returns null on any Graph
    // error, having logged the status itself. Nothing to add but the verdict.
    if (!created) {
      return {
        status: 'failed',
        provider: 'teams',
        reason: 'Microsoft Teams did not return a meeting. Paste a link instead.',
      };
    }
    return {
      status: 'created',
      provider: 'teams',
      meetUrl: created.joinUrl,
      providerMeetingId: created.meetingId,
    };
  } catch (err) {
    logger.error(LOG_SCOPE, 'teams provisioning threw', err);
    return {
      status: 'failed',
      provider: 'teams',
      reason: 'Microsoft Teams could not be reached. Paste a link instead.',
    };
  }
}

async function provisionGoogle(
  supabase: any,
  input: ProvisionMeetInput,
): Promise<MeetProvisionResult> {
  try {
    const connection = await GoogleCalendarService.getConnection(
      supabase,
      input.hostProfileId,
    );
    if (!connection || connection.status !== 'active') {
      return { status: 'not_configured', provider: 'google' };
    }

    const created = await GoogleCalendarService.createEvent(supabase, input.hostProfileId, {
      summary: input.title,
      description: input.description ?? '',
      startIso: input.startsAt,
      endIso: input.endsAt,
      timezone: input.timezone,
      // Addresses only. A guest with no email still gets a join token; they
      // simply do not appear on the calendar invite, which is correct — the
      // token link is their way in, not the calendar entry.
      attendees: input.attendees.filter((a) => !!a.email),
      withMeet: true,
    });

    if (!created) {
      logger.warn(LOG_SCOPE, 'createEvent returned null', {
        hostProfileId: input.hostProfileId,
      });
      return {
        status: 'failed',
        provider: 'google',
        reason: 'Google did not return an event.',
      };
    }
    if (!created.meetUrl) {
      // The event exists but conferencing did not attach. Report it rather
      // than storing a null link the host discovers at meeting time.
      return {
        status: 'failed',
        provider: 'google',
        reason: 'The calendar event was created but Google did not attach a Meet link.',
      };
    }

    return {
      status: 'created',
      provider: 'google',
      meetUrl: created.meetUrl,
      providerMeetingId: created.eventId,
    };
  } catch (err) {
    logger.error(LOG_SCOPE, 'google provisioning threw', err);
    return {
      status: 'failed',
      provider: 'google',
      reason: 'Google Calendar could not be reached. Paste a link instead.',
    };
  }
}

/** The sentence a host should read when provisioning did not produce a link. */
export function provisionNotice(result: MeetProvisionResult): string | null {
  if (result.status === 'created') return null;
  if (result.status === 'failed') return result.reason;

  switch (result.provider) {
    case 'teams':
      return 'Microsoft Teams is not connected on this deployment yet, so no Teams link was created. Paste a link on the meeting, and ask IT for the Microsoft Graph credentials to have them generated automatically.';
    case 'google':
      return 'Your Google Calendar is not connected, so no Meet link was created. Connect it under Meetings → My Availability & Page, or paste a link on the meeting.';
    default:
      return null;
  }
}
