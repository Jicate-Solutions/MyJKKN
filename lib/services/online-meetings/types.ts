/**
 * Online Meetings — domain types.
 *
 * Read `online_meeting_participants` first if you are new to this module: it
 * is the identity anchor, and understanding it explains every other shape
 * here. A participant row is either an internal profile or an external name
 * and email, never both, and attendance plus poll responses key off THAT row
 * rather than off `profiles`. That is the entire reason an external guest can
 * be recorded at all — AI Pulse's `ai_pulse_live_attendance.profile_id` is
 * NOT NULL and foreign-keyed to `profiles`, so somebody from outside JKKN is
 * not merely un-invited there, they are unrepresentable.
 */

import type {
  EngagementSignals,
  MeetingGateStatus,
  MeetingEngagementConfig,
} from '@/lib/services/live-engine/engagement-gates';

export type { EngagementSignals, MeetingGateStatus, MeetingEngagementConfig };

export type MeetingStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
/**
 * Where a meeting's link came from.
 *
 * 'teams' is the default provider. Measured 2026-09-09: 10 of the 10 AI Pulse
 * cycles that carry a link use a Teams URL, every one pasted by hand. Graph
 * exposes a meeting's attendance report only to its organizer, so a
 * platform-generated Teams link is also the only kind whose real attendance
 * the platform could ever read back.
 */
export type MeetSource = 'teams' | 'google' | 'manual';

/** What the organiser asked for. 'manual' means "I will paste one". */
export type MeetProvider = MeetSource;
export type JoinMode = 'invite_only' | 'open_link';
export type ParticipantKind = 'internal' | 'external';
export type InvitedVia = 'individual' | 'department' | 'institution' | 'open_link';
export type InviteStatus = 'invited' | 'sent' | 'opened' | 'joined' | 'declined';
export type ActionItemStatus = 'open' | 'in_progress' | 'done' | 'dropped';
export type AgendaItemStatus = 'pending' | 'discussed' | 'deferred' | 'dropped';

/** A meeting's quiz, same shape as the AI Pulse one so the panels can match. */
export interface MeetingQuizOption {
  id: string;
  text: string;
  is_correct: boolean;
}

export interface MeetingQuizQuestion {
  id: string;
  question: string;
  options: MeetingQuizOption[];
}

export interface MeetingQuiz {
  questions: MeetingQuizQuestion[];
  pass_threshold: number;
}

export const EMPTY_QUIZ: MeetingQuiz = { questions: [], pass_threshold: 50 };

export interface OnlineMeeting {
  id: string;
  institution_id: string;
  title: string;
  description: string | null;
  host_profile_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  /** As stored. Use `effective_status` for anything the clock decides. */
  status: MeetingStatus;
  meet_url: string | null;
  meet_source: MeetSource;
  google_event_id: string | null;
  recording_url: string | null;
  join_mode: JoinMode;
  open_join_token: string | null;
  engagement_config: MeetingEngagementConfig;
  quiz: MeetingQuiz;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** A meeting as a list row: joined counts, resolved host, derived status. */
export interface OnlineMeetingListRow extends OnlineMeeting {
  effective_status: MeetingStatus;
  host_name: string | null;
  participant_count: number;
  joined_count: number;
  /** True when the viewer hosts it (drives the row actions). */
  is_host: boolean;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  institution_id: string;
  participant_kind: ParticipantKind;
  profile_id: string | null;
  external_name: string | null;
  /**
   * Present only for the host and managers. The participant service projects
   * it away for everyone else — RLS is row-level, so it cannot hide a column
   * on a row somebody may legitimately read.
   */
  external_email: string | null;
  external_organization: string | null;
  /** Likewise host-only. It is a bearer credential, not a display field. */
  join_token: string | null;
  invited_via: InvitedVia;
  invite_status: InviteStatus;
  invited_at: string;
  /** Resolved for display: profile full name, or the external name. */
  display_name: string;
}

export interface MeetingPoll {
  id: string;
  meeting_id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  is_open: boolean;
  issued_at: string;
  closed_at: string | null;
}

/** A poll as the host's control sees it — with a live count. */
export interface MeetingPollWithCount extends MeetingPoll {
  response_count: number;
  /** Per-option tallies, keyed by option id. */
  tallies: Record<string, number>;
}

export interface MeetingAttendance {
  id: string | null;
  participant_id: string;
  joined_at: string | null;
  engagement_signals: EngagementSignals;
}

/**
 * Everything the live page needs, in one round trip — for an authenticated
 * participant and for a token-bearing guest alike. The two front doors resolve
 * identity differently and then call the same function.
 */
export interface LiveMeetingData {
  meeting: {
    id: string;
    title: string;
    description: string | null;
    /** Derived from the clock, not from the stored column. */
    status: MeetingStatus;
    starts_at: string;
    ends_at: string;
    timezone: string;
    meet_url: string | null;
    host_name: string | null;
  };
  participant: {
    id: string;
    display_name: string;
    kind: ParticipantKind;
  };
  attendance: MeetingAttendance;
  polls: MeetingPoll[];
  /** Poll ids this participant has already answered. */
  answered_poll_ids: string[];
  quiz: MeetingQuiz;
  quiz_open: boolean;
  quiz_async_window_open: boolean;
  config: Required<MeetingEngagementConfig>;
  /** Doors-open gate. False before the window and after the end. */
  join_open: boolean;
  join_opens_at: string | null;
}

export interface MeetingAgendaItem {
  id: string;
  meeting_id: string;
  title: string;
  detail: string | null;
  presenter_participant_id: string | null;
  presenter_name: string | null;
  sort_order: number;
  duration_min: number | null;
  status: AgendaItemStatus;
}

export interface MeetingMinutes {
  id: string;
  meeting_id: string;
  content: string;
  recorded_by: string | null;
  published_at: string | null;
  updated_at: string;
}

export interface MeetingActionItem {
  id: string;
  meeting_id: string;
  title: string;
  detail: string | null;
  owner_participant_id: string | null;
  owner_name: string | null;
  due_date: string | null;
  status: ActionItemStatus;
  completed_at: string | null;
}

/** One row of the post-meeting attendance and engagement report. */
export interface MeetingReportRow {
  participant_id: string;
  display_name: string;
  kind: ParticipantKind;
  organization: string | null;
  invited_via: InvitedVia;
  joined_at: string | null;
  polls_answered: number;
  quiz_score: number | null;
  stayed_until: string | null;
  gates: MeetingGateStatus;
}

export interface MeetingReport {
  meeting: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    polls_issued: number;
    quiz_required: boolean;
  };
  rows: MeetingReportRow[];
  totals: {
    invited: number;
    joined: number;
    engaged: number;
    internal_joined: number;
    external_joined: number;
    /** Null when the meeting measures nothing beyond presence. */
    engagement_rate: number | null;
  };
}

/**
 * Result of asking a provider for a link. Never throws, always reports.
 *
 * 'not_configured' is distinct from 'failed' on purpose: the first is the
 * normal state of a deployment whose IT has not delivered credentials yet, and
 * telling a host that Teams "failed" when it was simply never set up sends
 * them hunting for a problem that is not theirs.
 */
export type MeetProvisionResult =
  | {
      status: 'created';
      provider: MeetProvider;
      meetUrl: string;
      /** Google Calendar event id, or Graph onlineMeeting id. */
      providerMeetingId: string;
    }
  | { status: 'not_configured'; provider: MeetProvider }
  | { status: 'failed'; provider: MeetProvider; reason: string };
