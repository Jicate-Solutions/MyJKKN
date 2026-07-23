/**
 * Parent Portal — client services for the A2 academic features (browser fetch).
 */
import type {
  AttendanceSummary,
  FeesResponse,
  PayPayload,
  PayResponse,
  Announcement,
} from '@/types/parent-portal';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json as T;
}

export class ParentAttendanceService {
  static getSummary(learnerId: string) {
    return getJson<AttendanceSummary>(
      `/api/parent/attendance?learnerId=${encodeURIComponent(learnerId)}`
    );
  }
}

export class ParentFeeService {
  static getFees(learnerId: string) {
    return getJson<FeesResponse>(`/api/parent/fees?learnerId=${encodeURIComponent(learnerId)}`);
  }
  static pay(payload: PayPayload) {
    return postJson<PayResponse>('/api/parent/fees/pay', payload);
  }
}

export class ParentAnnouncementService {
  static list(learnerId: string) {
    return getJson<{ data: Announcement[] }>(
      `/api/parent/announcements?learnerId=${encodeURIComponent(learnerId)}`
    );
  }
}
