import {
  BosMeeting,
  BosMeetingStatus,
  BosMeetingFilters,
  BosListResponse,
  CreateBosMeetingDto,
  UpdateBosMeetingDto,
} from '@/types/bos';

export class BosMeetingService {
  private static baseUrl = '/api/bos/meetings';

  static async getMeetings(
    filters: BosMeetingFilters = {}
  ): Promise<BosListResponse<BosMeeting>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });

    const res = await fetch(`${this.baseUrl}?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch meetings' }));
      throw new Error(err.error ?? 'Failed to fetch meetings');
    }
    return res.json();
  }

  static async getMeeting(id: string): Promise<BosMeeting> {
    const res = await fetch(`${this.baseUrl}/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Meeting not found' }));
      throw new Error(err.error ?? 'Meeting not found');
    }
    return res.json();
  }

  static async createMeeting(data: CreateBosMeetingDto): Promise<BosMeeting> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create meeting' }));
      throw new Error(err.error ?? 'Failed to create meeting');
    }
    return res.json();
  }

  static async updateMeeting(id: string, data: UpdateBosMeetingDto): Promise<BosMeeting> {
    const res = await fetch(`${this.baseUrl}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update meeting' }));
      throw new Error(err.error ?? 'Failed to update meeting');
    }
    return res.json();
  }

  static async deleteMeeting(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete meeting' }));
      throw new Error(err.error ?? 'Failed to delete meeting');
    }
  }

  /**
   * Transition a meeting to the next state in the state machine.
   * `metadata` carries optional fields like principal_approved_by, ratified_date, etc.
   */
  static async transitionStatus(
    meetingId: string,
    newStatus: BosMeetingStatus,
    metadata?: Record<string, unknown>
  ): Promise<BosMeeting> {
    const res = await fetch(`${this.baseUrl}/${meetingId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, ...metadata }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to transition status' }));
      throw new Error(err.error ?? 'Failed to transition status');
    }
    return res.json();
  }

  /** Returns the next sequential meeting number for a board + academic year combo */
  static async getNextMeetingNumber(
    boardId: string,
    academicYear: string
  ): Promise<number> {
    const res = await fetch(
      `${this.baseUrl}/next-number?boardId=${boardId}&academicYear=${academicYear}`
    );
    if (!res.ok) throw new Error('Failed to get next meeting number');
    const { next_number } = await res.json();
    return next_number;
  }
}
