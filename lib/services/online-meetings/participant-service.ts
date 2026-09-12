/**
 * Online Meetings — participants and invitations.
 *
 * THE ONE THING TO UNDERSTAND
 *   A department or institution invite is expanded into individual participant
 *   rows AT INVITE TIME. It is tempting to store "this meeting invited the
 *   Mechanical department" and resolve it on read, and that is wrong twice
 *   over: attendance evidence has to name people, and a roster resolved on
 *   read silently rewrites history every time somebody transfers department.
 *   The `invited_via` column records how a row came to exist so the host can
 *   still see it was a bulk invite.
 *
 * EXPANSION IS CAPPED
 *   An institution-wide invite could otherwise generate thousands of rows and
 *   emails from one careless click. `previewExpansion` exists so the form can
 *   show the resolved count and let the organiser confirm before committing.
 */

import { BaseService } from '@/lib/services/base-service';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/utils/enhanced-logger';

import type {
  InvitedVia,
  MeetingParticipant,
  ParticipantKind,
} from './types';
import type { ServiceResult } from './meeting-service';

const LOG_SCOPE = 'online-meetings/participants';

/**
 * Hard ceiling on one bulk expansion. Chosen to be larger than any real JKKN
 * department or institution staff roll and small enough that a mistake is a
 * bad afternoon rather than an incident.
 */
export const MAX_BULK_INVITE = 500;

const PARTICIPANT_COLUMNS =
  'id, meeting_id, institution_id, participant_kind, profile_id, external_name, ' +
  'external_email, external_organization, join_token, invited_via, invite_status, invited_at';

export interface ExternalInviteInput {
  name: string;
  email?: string | null;
  organization?: string | null;
}

export interface ExpansionPreview {
  resolved: number;
  capped: boolean;
  /** Names, for the confirmation dialog. Truncated for display. */
  sample: string[];
}

/** Strip the host-only fields from a participant row. */
function project(
  row: any,
  profileName: Map<string, string | null>,
  includeSecrets: boolean,
): MeetingParticipant {
  const display =
    row.participant_kind === 'internal'
      ? (profileName.get(row.profile_id) ?? 'Unnamed colleague')
      : (row.external_name ?? 'Guest');
  return {
    id: row.id,
    meeting_id: row.meeting_id,
    institution_id: row.institution_id,
    participant_kind: row.participant_kind as ParticipantKind,
    profile_id: row.profile_id ?? null,
    external_name: row.external_name ?? null,
    // RLS is row-level: it cannot hide a column on a row somebody may read.
    // The email and the join token are therefore projected away here, in the
    // service, for anybody who is not the host. A join token in particular is
    // a bearer credential — handing it to a co-participant would let them
    // answer polls as somebody else.
    external_email: includeSecrets ? (row.external_email ?? null) : null,
    external_organization: row.external_organization ?? null,
    join_token: includeSecrets ? (row.join_token ?? null) : null,
    invited_via: row.invited_via as InvitedVia,
    invite_status: row.invite_status,
    invited_at: row.invited_at,
    display_name: display,
  };
}

export class MeetingParticipantService extends BaseService {
  /**
   * The roster. `includeSecrets` must be true only when the caller has already
   * been established as the host or a manager — this service does not decide
   * that, the route handler does, because that is where the auth context is.
   */
  static async list(
    meetingId: string,
    includeSecrets: boolean,
  ): Promise<ServiceResult<MeetingParticipant[]>> {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from('online_meeting_participants')
      .select(PARTICIPANT_COLUMNS)
      .eq('meeting_id', meetingId)
      .order('invited_at', { ascending: true });

    if (error) {
      logger.error(LOG_SCOPE, 'list failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }

    const rows = (data ?? []) as any[];
    const profileIds = Array.from(
      new Set(rows.map((r) => r.profile_id).filter(Boolean)),
    ) as string[];

    const profileName = new Map<string, string | null>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', profileIds);
      for (const p of (profiles ?? []) as any[]) {
        profileName.set(p.id, p.full_name ?? null);
      }
    }

    return {
      ok: true,
      data: rows.map((r) => project(r, profileName, includeSecrets)),
    };
  }

  /**
   * How many people a department or institution invite would actually add,
   * shown to the organiser before anything is written.
   */
  static async previewExpansion(
    scope: { kind: 'department'; departmentId: string } | { kind: 'institution'; institutionId: string },
  ): Promise<ServiceResult<ExpansionPreview>> {
    const profiles = await this.resolveStaffProfiles(scope);
    if (!profiles.ok) return profiles;
    const all = profiles.data;
    return {
      ok: true,
      data: {
        resolved: Math.min(all.length, MAX_BULK_INVITE),
        capped: all.length > MAX_BULK_INVITE,
        sample: all.slice(0, 8).map((p) => p.name ?? 'Unnamed colleague'),
      },
    };
  }

  /**
   * Active staff with a login, for one department or one institution.
   *
   * Reads `staff` and takes `profile_id`, NOT `profiles` directly: staff whose
   * institution_email was left blank never get a profile row at all, so they
   * cannot hold a participant row and must not appear in a roster that implies
   * they can join.
   */
  private static async resolveStaffProfiles(
    scope:
      | { kind: 'department'; departmentId: string }
      | { kind: 'institution'; institutionId: string },
  ): Promise<ServiceResult<Array<{ profileId: string; name: string | null }>>> {
    let query = this.supabase
      .from('staff')
      .select('profile_id, first_name, last_name')
      .eq('is_active', true)
      .not('profile_id', 'is', null);

    if (scope.kind === 'department') {
      query = query.eq('department_id', scope.departmentId);
    } else {
      query = query.eq('institution_id', scope.institutionId);
    }

    const { data, error } = await query.limit(MAX_BULK_INVITE + 1);
    if (error) {
      logger.error(LOG_SCOPE, 'staff expansion failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }

    const seen = new Set<string>();
    const out: Array<{ profileId: string; name: string | null }> = [];
    for (const s of (data ?? []) as any[]) {
      if (!s.profile_id || seen.has(s.profile_id)) continue;
      seen.add(s.profile_id);
      const name = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
      out.push({ profileId: s.profile_id, name: name || null });
    }
    return { ok: true, data: out };
  }

  /**
   * Add internal colleagues by profile id.
   *
   * Duplicates are ignored rather than rejected: inviting the Mechanical
   * department and then also naming its HOD is a completely normal thing to
   * do, and failing the whole request over it would be hostile.
   */
  static async addInternal(
    meetingId: string,
    institutionId: string,
    profileIds: string[],
    invitedBy: string,
    invitedVia: InvitedVia = 'individual',
  ): Promise<ServiceResult<{ added: number; skipped: number }>> {
    const unique = Array.from(new Set(profileIds.filter(Boolean)));
    if (unique.length === 0) return { ok: true, data: { added: 0, skipped: 0 } };
    if (unique.length > MAX_BULK_INVITE) {
      return {
        ok: false,
        error: `That would invite ${unique.length} people at once. The limit is ${MAX_BULK_INVITE}.`,
      };
    }

    const { data: existing } = await this.supabase
      .from('online_meeting_participants')
      .select('profile_id')
      .eq('meeting_id', meetingId)
      .in('profile_id', unique);

    const already = new Set(((existing ?? []) as any[]).map((r) => r.profile_id));
    const toAdd = unique.filter((id) => !already.has(id));
    if (toAdd.length === 0) {
      return { ok: true, data: { added: 0, skipped: unique.length } };
    }

    // Every row carries the same key set. A row that omits a key is sent as an
    // explicit NULL by PostgREST, which defeats the column DEFAULT — join_token
    // would arrive null and violate NOT NULL for the whole batch.
    const rows = toAdd.map((profileId) => ({
      meeting_id: meetingId,
      institution_id: institutionId,
      participant_kind: 'internal' as const,
      profile_id: profileId,
      invited_via: invitedVia,
      invited_by: invitedBy,
    }));

    const { error } = await this.supabase.from('online_meeting_participants').insert(rows);
    if (error) {
      logger.error(LOG_SCOPE, 'addInternal failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: { added: toAdd.length, skipped: unique.length - toAdd.length } };
  }

  /** Invite every active staff member of a department or an institution. */
  static async addScope(
    meetingId: string,
    institutionId: string,
    scope:
      | { kind: 'department'; departmentId: string }
      | { kind: 'institution'; institutionId: string },
    invitedBy: string,
  ): Promise<ServiceResult<{ added: number; skipped: number }>> {
    const resolved = await this.resolveStaffProfiles(scope);
    if (!resolved.ok) return resolved;
    if (resolved.data.length > MAX_BULK_INVITE) {
      return {
        ok: false,
        error: `That ${scope.kind} resolves to more than ${MAX_BULK_INVITE} people. Invite them in smaller groups.`,
      };
    }
    return this.addInternal(
      meetingId,
      institutionId,
      resolved.data.map((p) => p.profileId),
      invitedBy,
      scope.kind === 'department' ? 'department' : 'institution',
    );
  }

  /**
   * Add external guests. Each gets their own join token — one shared link
   * would make every guest indistinguishable in the attendance report, which
   * defeats the point of inviting them by name.
   */
  static async addExternal(
    meetingId: string,
    institutionId: string,
    guests: ExternalInviteInput[],
    invitedBy: string,
  ): Promise<ServiceResult<{ added: number; skipped: number }>> {
    const cleaned = guests
      .map((g) => ({
        name: g.name?.trim() ?? '',
        email: g.email?.trim().toLowerCase() || null,
        organization: g.organization?.trim() || null,
      }))
      .filter((g) => g.name.length > 0);

    if (cleaned.length === 0) {
      return { ok: false, error: 'A guest needs at least a name.' };
    }
    if (cleaned.length > MAX_BULK_INVITE) {
      return { ok: false, error: `The limit is ${MAX_BULK_INVITE} guests at a time.` };
    }

    const withEmail = cleaned.filter((g) => g.email).map((g) => g.email as string);
    const already = new Set<string>();
    if (withEmail.length > 0) {
      const { data: existing } = await this.supabase
        .from('online_meeting_participants')
        .select('external_email')
        .eq('meeting_id', meetingId)
        .in('external_email', withEmail);
      for (const r of (existing ?? []) as any[]) {
        if (r.external_email) already.add(String(r.external_email).toLowerCase());
      }
    }

    const toAdd = cleaned.filter((g) => !g.email || !already.has(g.email));
    if (toAdd.length === 0) {
      return { ok: true, data: { added: 0, skipped: cleaned.length } };
    }

    const rows = toAdd.map((g) => ({
      meeting_id: meetingId,
      institution_id: institutionId,
      participant_kind: 'external' as const,
      external_name: g.name,
      external_email: g.email,
      external_organization: g.organization,
      invited_via: 'individual' as const,
      invited_by: invitedBy,
    }));

    const { error } = await this.supabase.from('online_meeting_participants').insert(rows);
    if (error) {
      logger.error(LOG_SCOPE, 'addExternal failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: { added: toAdd.length, skipped: cleaned.length - toAdd.length } };
  }

  /** Remove somebody from the invite list. Cascades their attendance row. */
  static async remove(participantId: string): Promise<ServiceResult> {
    const { error } = await this.supabase
      .from('online_meeting_participants')
      .delete()
      .eq('id', participantId);
    if (error) {
      logger.error(LOG_SCOPE, 'remove failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: undefined };
  }

  /**
   * Revoke a guest's link by issuing a new token. The old URL stops working
   * immediately, which is the only remedy available once a link has been
   * forwarded — the token IS the credential.
   */
  static async regenerateToken(
    participantId: string,
  ): Promise<ServiceResult<{ join_token: string }>> {
    const { data, error } = await this.supabase
      .from('online_meeting_participants')
      .update({ join_token: crypto.randomUUID() })
      .eq('id', participantId)
      .select('join_token')
      .maybeSingle();

    if (error) {
      logger.error(LOG_SCOPE, 'regenerateToken failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    if (!data) {
      return { ok: false, error: 'That invitation could not be updated.' };
    }
    return { ok: true, data: { join_token: data.join_token } };
  }

  /** Mark an invitation as emailed, opened, or declined. */
  static async setInviteStatus(
    participantId: string,
    status: MeetingParticipant['invite_status'],
  ): Promise<ServiceResult> {
    const { error } = await this.supabase
      .from('online_meeting_participants')
      .update({ invite_status: status })
      .eq('id', participantId);
    if (error) {
      logger.error(LOG_SCOPE, 'setInviteStatus failed', error);
      return { ok: false, error: getErrorMessage(error) };
    }
    return { ok: true, data: undefined };
  }
}
