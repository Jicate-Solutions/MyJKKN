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

/** A failed parent API call; `code` carries the server's machine-readable reason. */
export class ParentApiError extends Error {
  code?: string;
  status: number;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ParentApiError';
    this.status = status;
    this.code = code;
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ParentApiError(
      json.error || 'Request failed',
      res.status,
      typeof json.code === 'string' ? json.code : undefined
    );
  }
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
