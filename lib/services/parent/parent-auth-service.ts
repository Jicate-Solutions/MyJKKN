/**
 * Parent Portal — client auth service (browser fetch → /api/parent/auth/*).
 * The session is an HttpOnly cookie set by the API, so there is no token to
 * store here; we just call the endpoints and let the browser carry the cookie.
 */
import type {
  LoginPayload,
  RegisterPayload,
  ForgotPayload,
  OtpPurpose,
  SiblingCandidate,
} from '@/types/parent-portal';

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

export interface SendOtpResponse {
  ok: boolean;
  devCode?: string; // present only in non-production
  matchedLearner?: {
    learnerProfileId: string;
    fullName: string;
    admissionNumber: string;
    relationship: 'father' | 'mother';
  };
  siblings?: SiblingCandidate[];
  error?: string;
}

export class ParentAuthService {
  static login(payload: LoginPayload) {
    return postJson<{ ok: true; parent: unknown }>('/api/parent/auth/login', payload);
  }

  static sendOtp(payload: { mobile: string; admission?: string; purpose: OtpPurpose }) {
    return postJson<SendOtpResponse>('/api/parent/auth/otp', payload);
  }

  static register(payload: RegisterPayload) {
    return postJson<{ ok: true; linkedCount: number }>('/api/parent/auth/register', payload);
  }

  static forgot(payload: ForgotPayload) {
    return postJson<{ ok: true }>('/api/parent/auth/forgot', payload);
  }

  static logout() {
    return postJson<{ ok: true }>('/api/parent/auth/logout', {});
  }
}
