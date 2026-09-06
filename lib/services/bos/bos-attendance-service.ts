import { BosMeetingAttendee, BosAttendanceMode, BosAttendanceStatus } from '@/types/bos';

export interface AttendanceUpsertRecord {
  member_id: string;
  attendance_status: BosAttendanceStatus;
  /**
   * Offline (in person) or online. Drives which sitting charge the
   * auto-generated TA/DA claim uses, and whether travel is paid at all.
   * Omitted = offline.
   */
  attendance_mode?: BosAttendanceMode;
  absence_reason?: string;
  ta_da_eligible?: boolean;
  institutions_id: string;
}

export class BosAttendanceService {
  static async getAttendance(meetingId: string): Promise<BosMeetingAttendee[]> {
    const res = await fetch(`/api/bos/meetings/${meetingId}/attendance`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch attendance' }));
      throw new Error(err.error ?? 'Failed to fetch attendance');
    }
    return res.json();
  }

  /**
   * Bulk upsert attendance records. Replaces any existing records for the
   * same meeting+member.
   *
   * Response unwrap (2026-05-21 SOP redesign): the attendance POST route
   * now returns `{ attendees, autoClaims }` so the auto-claim sync result
   * is available to callers that want to surface "N claims generated".
   * This service unwraps to keep the legacy `BosMeetingAttendee[]` return
   * contract — useSaveBosAttendance writes this directly into the GET
   * cache via setQueryData, and that cache is typed as an array. Without
   * the unwrap, the cache would hold an object and the next render of
   * AttendanceTab would crash on `.map`.
   */
  static async saveAttendance(
    meetingId: string,
    records: AttendanceUpsertRecord[]
  ): Promise<BosMeetingAttendee[]> {
    const res = await fetch(`/api/bos/meetings/${meetingId}/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(records),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save attendance' }));
      throw new Error(err.error ?? 'Failed to save attendance');
    }
    const json = await res.json();
    // Bare-array shape (pre-SOP redesign) or envelope shape — both supported.
    return Array.isArray(json) ? json : (json?.attendees ?? []);
  }
}
