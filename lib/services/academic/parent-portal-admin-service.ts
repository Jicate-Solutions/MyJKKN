/**
 * Staff admin — Parent Portal content service (Layer 3, browser fetch).
 * Wraps the /api/academic/parent-portal/* routes used by the authoring UI.
 * Follows myjkkn-page-development: static methods, thin fetch wrappers.
 */
import type { Attachment } from '@/types/parent-portal';

export type PPFeature = 'announcements' | 'homework' | 'achievements';

export interface PPInstitution { id: string; name: string; entity_type: string }
export interface PPProgram { id: string; program_name: string }
export interface PPSection { id: string; section_name: string }
export interface PPLearner { id: string; name: string; admission: string }

export interface PPOptions {
  institutions: PPInstitution[];
  programs: PPProgram[];
  sections: PPSection[];
  learners: PPLearner[];
}

export interface PPUserRow {
  accountId: string;
  learnerId: string;
  rollNumber: string;
  learnerName: string;
  fatherMobile: string;
  motherMobile: string;
  loginMobile: string;
  password: string;
  isAdminReset: boolean;
  isActive: boolean;
}

export interface PPUsersResponse {
  institutions: PPInstitution[];
  users: PPUserRow[];
  institutionId: string | null;
}

/** Cascading multi-select targeting shared by the forms. */
export interface PPTarget {
  institutionId: string;
  programIds: string[];
  sectionIds: string[];
  learnerIds: string[];
}

export interface CreateAnnouncementDto {
  institutionId: string;
  title: string;
  body?: string;
  category?: string;
  programId?: string;
  sectionId?: string;
  learnerId?: string;
  linkUrl?: string;
  attachments?: Attachment[];
}
export interface CreateHomeworkDto {
  institutionId: string;
  sectionId: string;
  subject?: string;
  title: string;
  instructions?: string;
  dueDate?: string;
  maxMarks?: number;
  attachments?: Attachment[];
}
export interface CreateAchievementDto {
  institutionId: string;
  learnerId?: string;
  admission?: string;
  title: string;
  description?: string;
  category?: string;
  achievedOn?: string;
  attachments?: Attachment[];
}
export interface CreateEventDto {
  institutionId: string;
  title: string;
  description?: string;
  eventDate?: string;
  venue?: string;
}

const BASE = '/api/academic/parent-portal';

async function getJson<T>(url: string): Promise<{ ok: boolean; status: number; json: T }> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, json };
}
async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Request failed');
}

export class ParentPortalAdminService {
  /** Cascading picklists. Returns 403 status when the caller isn't allowed. */
  static getOptions(params?: { institutionId?: string; programIds?: string[]; sectionIds?: string[] }) {
    const qs = new URLSearchParams();
    if (params?.institutionId) qs.set('institutionId', params.institutionId);
    if (params?.programIds?.length) qs.set('programIds', params.programIds.join(','));
    if (params?.sectionIds?.length) qs.set('sectionIds', params.sectionIds.join(','));
    const q = qs.toString();
    return getJson<PPOptions>(`${BASE}/options${q ? `?${q}` : ''}`);
  }

  static listAnnouncements(institutionId: string) {
    return getJson<{ data: any[] }>(`${BASE}/announcements?institutionId=${institutionId}`);
  }
  static createAnnouncement(dto: CreateAnnouncementDto) {
    return postJson(`${BASE}/announcements`, dto);
  }

  static listHomework(institutionId: string) {
    return getJson<{ data: any[] }>(`${BASE}/homework?institutionId=${institutionId}`);
  }
  static createHomework(dto: CreateHomeworkDto) {
    return postJson(`${BASE}/homework`, dto);
  }

  static listAchievements(institutionId: string) {
    return getJson<{ data: any[] }>(`${BASE}/achievements?institutionId=${institutionId}`);
  }
  static createAchievement(dto: CreateAchievementDto) {
    return postJson(`${BASE}/achievements`, dto);
  }

  static listEvents(institutionId: string) {
    return getJson<{ data: any[] }>(`${BASE}/events?institutionId=${institutionId}`);
  }
  static createEvent(dto: CreateEventDto) {
    return postJson(`${BASE}/events`, dto);
  }

  /**
   * Upload one file to Google Drive (Institution/Feature/Program?/Section?) and
   * return its Attachment metadata. `context` forwards the current target so the
   * route can nest the folder; achievements pass learnerIds, others pass
   * program/section ids.
   */
  static async uploadAttachment(
    file: File,
    feature: PPFeature,
    institutionId: string,
    context?: { programIds?: string[]; sectionIds?: string[]; learnerIds?: string[] }
  ): Promise<Attachment> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('feature', feature);
    fd.append('institutionId', institutionId);
    if (context?.programIds?.length) fd.append('programIds', context.programIds.join(','));
    if (context?.sectionIds?.length) fd.append('sectionIds', context.sectionIds.join(','));
    if (context?.learnerIds?.length) fd.append('learnerIds', context.learnerIds.join(','));

    const res = await fetch(`${BASE}/upload`, { method: 'POST', body: fd });
    const json = (await res.json().catch(() => ({}))) as { attachment?: Attachment; error?: string };
    if (!res.ok || !json.attachment) throw new Error(json.error || 'Upload failed');
    return json.attachment;
  }

  // ── Parent User Data (super_admin / principal only) ──────────────────
  static listParentUsers(target?: {
    institutionId?: string;
    programIds?: string[];
    sectionIds?: string[];
    learnerIds?: string[];
  }) {
    const qs = new URLSearchParams();
    if (target?.institutionId) qs.set('institutionId', target.institutionId);
    if (target?.programIds?.length) qs.set('programIds', target.programIds.join(','));
    if (target?.sectionIds?.length) qs.set('sectionIds', target.sectionIds.join(','));
    if (target?.learnerIds?.length) qs.set('learnerIds', target.learnerIds.join(','));
    const q = qs.toString();
    return getJson<PPUsersResponse>(`${BASE}/users${q ? `?${q}` : ''}`);
  }

  static async resetParentPassword(accountId: string, password: string): Promise<void> {
    const res = await fetch(`${BASE}/users/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to reset password');
  }
}
