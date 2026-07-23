/**
 * Attendance escalation (session_wise / school day-wise)
 * ------------------------------------------------------------------
 * When the class incharge has NOT marked a school's Morning or Afternoon
 * session by a fixed cutoff, escalate to the institution's Principal and
 * Director via an in-app notification (the existing notifications/bell system).
 *
 * WhatsApp is intentionally out of scope here — it is a future update. This
 * service only emits IN_APP notifications.
 *
 * Trigger model: this is a pure, idempotent-ish function. It can be invoked
 *   - manually from the pending-attendance dashboard ("Send reminder"), or
 *   - by a scheduled job (cron / Supabase scheduled function) once per cutoff.
 * The global cutoff was chosen on 2026-06-10: Morning 11:00, Afternoon 15:30.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { createNotification } from '@/lib/services/notification/notification-service';
import {
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationChannel
} from '@/types/notification';
import { parseTimeToMinutes } from '@/lib/utils/academic/attendance-sessions';
import { AttendanceDashboardService } from './attendance-dashboard-service';
import type { PendingAttendancePeriod } from '@/types/attendance-dashboard';

/** Global fixed cutoffs — a session is "late" once its cutoff time has passed. */
export const SESSION_ESCALATION_CUTOFFS = {
  morning: '11:00',
  afternoon: '15:30'
} as const;

const MORNING_LABEL = 'Morning Session';
const AFTERNOON_LABEL = 'Afternoon Session';

export interface EscalationResult {
  /** Number of in-app notifications created. */
  notified: number;
  /** Number of pending sessions that were past cutoff. */
  escalatedSessions: number;
  /** Number of institutions that had at least one overdue session. */
  institutions: number;
}

export class AttendanceEscalationService {
  private static supabase = createClientSupabaseClient();

  /**
   * Escalate any session_wise sessions that are still unmarked past their
   * cutoff for the given date (defaults to today) to Principal & Director.
   */
  static async escalatePendingSessions(
    opts: {
      institutionId?: string;
      date?: string;
      now?: Date;
      /** Manual reminders escalate regardless of the time-of-day cutoff. */
      ignoreCutoff?: boolean;
    } = {}
  ): Promise<EscalationResult> {
    const now = opts.now ?? new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const today =
      opts.date ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;

    // Pull all pending periods for the day. limit is generous because we want
    // every overdue session, not a page.
    const pending = await AttendanceDashboardService.getTodayPendingAttendance({
      startDate: today,
      endDate: today,
      institutionId: opts.institutionId,
      limit: 1000,
      page: 1
    });

    // Keep only session_wise sessions (relabelled Morning/Afternoon by the
    // dashboard service) whose cutoff has already passed.
    const morningCutoff =
      parseTimeToMinutes(SESSION_ESCALATION_CUTOFFS.morning) ?? 11 * 60;
    const afternoonCutoff =
      parseTimeToMinutes(SESSION_ESCALATION_CUTOFFS.afternoon) ?? 15 * 60 + 30;

    const overdue = (pending.data || []).filter((p) => {
      if (p.period_name === MORNING_LABEL)
        return opts.ignoreCutoff || nowMinutes >= morningCutoff;
      if (p.period_name === AFTERNOON_LABEL)
        return opts.ignoreCutoff || nowMinutes >= afternoonCutoff;
      return false; // not a session_wise session
    });

    if (overdue.length === 0) {
      return { notified: 0, escalatedSessions: 0, institutions: 0 };
    }

    // Group overdue sessions by institution.
    const byInstitution = new Map<string, PendingAttendancePeriod[]>();
    for (const p of overdue) {
      if (!p.institution_id) continue;
      if (!byInstitution.has(p.institution_id))
        byInstitution.set(p.institution_id, []);
      byInstitution.get(p.institution_id)!.push(p);
    }

    let notified = 0;
    for (const [institutionId, sessions] of byInstitution) {
      const recipients = await this.getPrincipalAndDirectorProfileIds(
        institutionId
      );
      if (recipients.length === 0) {
        logger.warn(
          'academic/attendance',
          'No principal/director profile found for escalation',
          { institutionId }
        );
        continue;
      }

      const institutionName =
        sessions[0]?.institution_name || 'your institution';
      const lines = sessions
        .map(
          (s) =>
            `• ${s.section_name || 'Section'} — ${s.period_name} (${s.attendance_date})`
        )
        .join('\n');

      const title = `Attendance not marked — ${institutionName}`;
      const message =
        `${sessions.length} session${sessions.length === 1 ? '' : 's'} have not been ` +
        `marked by the class incharge past the cutoff:\n${lines}`;

      for (const userId of recipients) {
        try {
          await createNotification({
            user_id: userId,
            type: NotificationType.WARNING,
            category: NotificationCategory.SYSTEM,
            priority: NotificationPriority.HIGH,
            title,
            message,
            action_url: '/academic/attendance/pending',
            action_label: 'View pending attendance',
            channels: [NotificationChannel.IN_APP],
            metadata: {
              institution_id: institutionId,
              date: today,
              session_count: sessions.length
            } as any
          });
          notified++;
        } catch (error) {
          logger.error(
            'academic/attendance',
            'Failed to create escalation notification',
            { institutionId, userId, error }
          );
        }
      }
    }

    return {
      notified,
      escalatedSessions: overdue.length,
      institutions: byInstitution.size
    };
  }

  /**
   * Resolve the profile ids of the Principal and Director of an institution.
   * profiles.role carries the role_key and profiles.id is the notification
   * recipient (== auth user id), so this is a direct lookup.
   */
  private static async getPrincipalAndDirectorProfileIds(
    institutionId: string
  ): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, role')
      .eq('institution_id', institutionId)
      .in('role', ['principal', 'director'])
      .eq('is_active', true);

    if (error || !data) {
      logger.error(
        'academic/attendance',
        'Error resolving principal/director profiles',
        { institutionId, error }
      );
      return [];
    }

    return (data as Array<{ id: string }>).map((r) => r.id).filter(Boolean);
  }
}
