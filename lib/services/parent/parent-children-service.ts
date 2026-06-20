/**
 * Parent Portal — client children/profile services (browser fetch).
 */
import type {
  ParentChild,
  ParentSession,
  ParentProfileResponse,
} from '@/types/parent-portal';

export interface ChildrenResponse {
  parent: ParentSession;
  data: ParentChild[];
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json as T;
}

export class ParentChildrenService {
  static getChildren() {
    return getJson<ChildrenResponse>('/api/parent/children');
  }
}

export class ParentProfileService {
  static getProfile(learnerId: string) {
    return getJson<ParentProfileResponse>(
      `/api/parent/profile?learnerId=${encodeURIComponent(learnerId)}`
    );
  }
}
