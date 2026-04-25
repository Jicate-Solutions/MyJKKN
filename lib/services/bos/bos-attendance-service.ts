import { BosMeetingAttendee, BosAttendanceStatus } from '@/types/bos';

export interface AttendanceUpsertRecord {
  member_id: string;
  attendance_status: BosAttendanceStatus;
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

  /** Bulk upsert attendance records. Replaces any existing records for the same meeting+member. */
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
    return res.json();
  }
}
