/**
 * Parent Portal — client services for A3–A5 features (browser fetch).
 * Thin wrappers over the /api/parent/* routes; all auth rides the cookie.
 */
import type {
  Homework,
  Achievement,
  Poll,
  VotePayload,
  Concern,
  ConcernThread,
  CreateConcernPayload,
  EventItem,
  SpotlightItem,
  WellnessRecord,
  ParentNotification,
  BusInfo,
  GatePass,
  CreateGatePassPayload,
  LeaveRequest,
  CreateLeavePayload,
  PickupMember,
  CreatePickupMemberPayload,
  CreateFeedbackPayload,
  AddSiblingPayload,
  Attachment,
} from '@/types/parent-portal';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json as T;
}
async function send<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json as T;
}

const ql = (learnerId: string, path: string) =>
  `/api/parent/${path}?learnerId=${encodeURIComponent(learnerId)}`;

export const ParentFeatures = {
  // A3 — Homework
  homeworkList: (l: string) => getJson<{ data: Homework[] }>(ql(l, 'homework')),
  homework: (id: string, l: string) =>
    getJson<Homework>(`/api/parent/homework/${id}?learnerId=${encodeURIComponent(l)}`),
  submitHomework: (id: string, learnerId: string, submissionText: string, attachments?: Attachment[]) =>
    send<{ ok: true }>(`/api/parent/homework/${id}/submit`, 'POST', { learnerId, submissionText, attachments }),

  // A4 — Achievements / Polls / Concerns / Events / Spotlight / Wellness / Notifications
  achievements: (l: string) => getJson<{ data: Achievement[] }>(ql(l, 'achievements')),
  polls: (l: string) => getJson<{ data: Poll[] }>(ql(l, 'polls')),
  vote: (p: VotePayload) => send<{ ok: true }>('/api/parent/polls', 'POST', p),
  concerns: () => getJson<{ data: Concern[] }>('/api/parent/concerns'),
  concern: (id: string) => getJson<ConcernThread>(`/api/parent/concerns/${id}`),
  createConcern: (p: CreateConcernPayload) => send<{ ok: true; id: string }>('/api/parent/concerns', 'POST', p),
  replyConcern: (id: string, message: string) =>
    send<{ ok: true }>(`/api/parent/concerns/${id}`, 'POST', { message }),
  events: (l: string) => getJson<{ data: EventItem[] }>(ql(l, 'events')),
  spotlight: (l: string) => getJson<{ data: SpotlightItem[] }>(ql(l, 'spotlight')),
  wellness: (l: string) => getJson<{ data: WellnessRecord[] }>(ql(l, 'wellness')),
  notifications: () => getJson<{ data: ParentNotification[]; unread: number }>('/api/parent/notifications'),
  markNotification: (id?: string, all?: boolean) =>
    send<{ ok: true }>('/api/parent/notifications', 'PATCH', all ? { all: true } : { id }),

  // A5 — Bus / Gate Pass / Leaves / Pickup / Feedback / Add sibling
  bus: (l: string) => getJson<{ data: BusInfo | null }>(ql(l, 'bus')),
  gatePasses: (l: string) => getJson<{ data: GatePass[] }>(ql(l, 'gate-pass')),
  createGatePass: (p: CreateGatePassPayload) => send<{ ok: true }>('/api/parent/gate-pass', 'POST', p),
  leaves: (l: string) => getJson<{ data: LeaveRequest[] }>(ql(l, 'leaves')),
  createLeave: (p: CreateLeavePayload) => send<{ ok: true }>('/api/parent/leaves', 'POST', p),
  pickupMembers: () => getJson<{ data: PickupMember[] }>('/api/parent/pickup-members'),
  addPickupMember: (p: CreatePickupMemberPayload) =>
    send<{ ok: true }>('/api/parent/pickup-members', 'POST', p),
  feedback: (p: CreateFeedbackPayload) => send<{ ok: true }>('/api/parent/feedback', 'POST', p),
  addSibling: (p: AddSiblingPayload) => send<{ ok: true }>('/api/parent/children/add', 'POST', p),
};
