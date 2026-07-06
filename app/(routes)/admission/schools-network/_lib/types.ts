/**
 * Schools Network — UI-local types.
 *
 * Mirrors the wire shapes from /tmp/schools-network-spec.md §6/§7/§8.
 * Kept inside the UI tree (`app/(routes)/admission/schools-network/_lib/`)
 * because Agent B owns the canonical `lib/types/schools-network.ts` and the
 * `lib/services/schools-network/*` typed services in a sibling PR.
 *
 * NON-NEGOTIABLE META-PRINCIPLE: pre-write survey confirmed there is no
 * shared `lib/types/schools-network.ts` in this branch (Agent B's PR is
 * sibling-parallel). Rather than block on a cross-PR import, the UI tree
 * defines the contract it consumes via the API endpoint shapes. When B's PR
 * merges, the canonical module-level types replace these without page
 * rewrites (this file becomes a thin adapter or is removed).
 */

export type SchoolOwnership = 'external' | 'internal';
export type SchoolStatus = 'active' | 'sustaining' | 'dormant' | 'inactive';
export type SchoolOwnerRole = 'outreach_coordinator' | 'program_lead';
export type ContributionKind =
  | 'device'
  | 'branding'
  | 'website'
  | 'fund'
  | 'training_kit'
  | 'other';
export type ProgramPartnerStatus = 'active' | 'sustaining' | 'dormant';

export interface SchoolSessionType {
  id: string;
  code: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  displayOrder: number;
  isActive: boolean;
}

export interface ProgramPartnerType {
  id: string;
  code: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  displayOrder: number;
  isActive: boolean;
}

export interface SchoolContactRole {
  id: string;
  code: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  displayOrder: number;
  isActive: boolean;
  canLoginToPortal: boolean;
}

export interface School {
  id: string;
  name: string;
  ownership: SchoolOwnership;
  institutionId: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  intakeYear: number | null;
  status: SchoolStatus;
  statusChangedAt: string;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolContact {
  id: string;
  schoolId: string;
  roleId: string;
  roleCode?: string;
  roleLabel?: string;
  name: string;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolJkknOwner {
  id: string;
  schoolId: string;
  jkknUserId: string;
  jkknUserName?: string;
  jkknUserEmail?: string;
  role: SchoolOwnerRole;
  programPartnerId: string | null;
  programPartnerName?: string | null;
  assignedAt: string;
  assignedBy: string | null;
  isActive: boolean;
}

export interface SchoolSession {
  id: string;
  schoolId: string;
  sessionTypeId: string;
  sessionTypeCode?: string;
  sessionTypeLabel?: string;
  conductedAt: string;
  conductedByUserId: string | null;
  conductedByName?: string;
  programPartnerId: string | null;
  programPartnerName?: string | null;
  attendeeCount: number;
  topic: string | null;
  notes: string | null;
  attachments: Array<{ url: string; filename: string; mimeType: string }>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolContribution {
  id: string;
  schoolId: string;
  kind: ContributionKind;
  description: string;
  valueInr: number | null;
  deliveredAt: string | null;
  programPartnerId: string | null;
  programPartnerName?: string | null;
  evidenceUrl: string | null;
  metadata: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramPartner {
  id: string;
  name: string;
  typeId: string;
  typeCode?: string;
  typeLabel?: string;
  contactEmail: string | null;
  contactPhone: string | null;
  contactPerson: string | null;
  websiteUrl: string | null;
  status: ProgramPartnerStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolListRow {
  id: string;
  name: string;
  ownership: SchoolOwnership;
  district: string | null;
  state: string | null;
  status: SchoolStatus;
  intakeYear: number | null;
  primaryOwnerUserId: string | null;
  primaryOwnerName: string | null;
  programPartnerId: string | null;
  programPartnerName: string | null;
  lastSessionAt: string | null;
  sessionCount: number;
  totalContributionInr: number;
}

// Server payload shapes — describe what's INSIDE `body.data` from
// `successResponse<T>(...)`. Client `call()` unwraps the envelope before
// handing off, so these types describe the post-unwrap payload.
export interface SchoolListResponse {
  rows: SchoolListRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface SchoolDetailResponse {
  school: School;
  owners: SchoolJkknOwner[];
  contacts: SchoolContact[];
  recentSessions: SchoolSession[];
  contributionTotals: { count: number; valueInr: number };
}

export interface ProgramPartnerListResponse {
  rows: ProgramPartner[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProgramPartnerRollup {
  partnerId: string;
  partnerName: string;
  schoolsTouched: number;
  sessionsCount: number;
  attendeesTotal: number;
  contributionsCount: number;
  contributionsInr: number;
  grantsReceivedInr: number;
  grantsOutstandingInr: number;
}

export interface SchoolsListFilters {
  search?: string;
  ownership?: SchoolOwnership;
  status?: SchoolStatus;
  state?: string;
  district?: string;
  programPartnerId?: string;
  jkknUserId?: string;
  hasActiveOwner?: boolean;
  limit?: number;
  offset?: number;
}

export interface CreateSchoolInput {
  name: string;
  ownership: SchoolOwnership;
  institutionId?: string;
  district?: string;
  state?: string;
  pincode?: string;
  address?: string;
  intakeYear?: number;
  status?: SchoolStatus;
}

export interface CreateSessionInput {
  sessionTypeCode: string;
  conductedAt: string;
  attendeeCount?: number;
  programPartnerId?: string;
  topic?: string;
  notes?: string;
}

export interface CreateContributionInput {
  kind: ContributionKind;
  description: string;
  valueInr?: number;
  deliveredAt?: string;
  programPartnerId?: string;
  evidenceUrl?: string;
}

export interface CreateContactInput {
  name: string;
  roleId: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
  notes?: string;
}

export interface AssignOwnerInput {
  jkknUserId: string;
  role: SchoolOwnerRole;
  programPartnerId?: string;
}

// Wire shape of GET /api/schools-network/staff-search — a JKKN staff row
// eligible to own a school relationship. camelCase mirrors the endpoint.
export interface StaffSearchRow {
  id: string;
  fullName: string;
  email: string | null;
  role: string | null;
  institutionId: string | null;
}

/* Display helpers — keep alongside the types so callers don't fork copies. */

export const STATUS_LABEL: Record<SchoolStatus, string> = {
  active: 'Active',
  sustaining: 'Sustaining',
  dormant: 'Dormant',
  inactive: 'Inactive',
};

export const STATUS_COLOR: Record<SchoolStatus, string> = {
  active: 'bg-green-100 text-green-800',
  sustaining: 'bg-blue-100 text-blue-800',
  dormant: 'bg-amber-100 text-amber-800',
  inactive: 'bg-gray-100 text-gray-800',
};

export const OWNERSHIP_LABEL: Record<SchoolOwnership, string> = {
  external: 'External',
  internal: 'JKKN (Internal)',
};

export const OWNERSHIP_COLOR: Record<SchoolOwnership, string> = {
  external: 'bg-slate-100 text-slate-800',
  internal: 'bg-indigo-100 text-indigo-800',
};

export const CONTRIBUTION_LABEL: Record<ContributionKind, string> = {
  device: 'Device / Hardware',
  branding: 'Branding',
  website: 'Website',
  fund: 'Funds',
  training_kit: 'Training Kit',
  other: 'Other',
};

export const OWNER_ROLE_LABEL: Record<SchoolOwnerRole, string> = {
  outreach_coordinator: 'Outreach Coordinator',
  program_lead: 'Program Lead',
};

export const PARTNER_STATUS_LABEL: Record<ProgramPartnerStatus, string> = {
  active: 'Active',
  sustaining: 'Sustaining',
  dormant: 'Dormant',
};

export function formatInr(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

/* ─── Program-partner member schools + status ────────────── */
export type AiSessionStatus =
  | 'not_started'
  | 'interested'
  | 'scheduled'
  | 'conducted'
  | 'declined';
export type WebsiteStatus = 'not_started' | 'in_progress' | 'live';

export const AI_SESSION_STATUS_LABEL: Record<AiSessionStatus, string> = {
  not_started: 'Not started',
  interested: 'Interested',
  scheduled: 'Scheduled',
  conducted: 'Conducted',
  declined: 'Declined',
};
export const WEBSITE_STATUS_LABEL: Record<WebsiteStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  live: 'Live',
};

export interface PartnerSchool {
  id: string;
  schoolId: string;
  schoolName: string | null;
  district: string | null;
  aiSessionStatus: AiSessionStatus;
  websiteStatus: WebsiteStatus;
  domainUrl: string | null;
  brandingDone: boolean;
  nanMudhalvan: boolean;
  ownerName: string | null;
  ownerUserId: string | null;
  updatedAt: string;
}
