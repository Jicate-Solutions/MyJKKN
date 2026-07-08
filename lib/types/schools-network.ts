// lib/types/schools-network.ts
// ============================================================================
// Schools Network module types — Agent B service+API layer.
// Mirrors production schools / school_sessions / school_contributions /
// school_jkkn_owners / program_partners / program_partner_grants tables and
// the fn_* RPC return shapes defined in the spec.
// ============================================================================

// ── Enums (mirror DB enums) ─────────────────────────────────────────────────
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

// ── Master (value-list) rows ────────────────────────────────────────────────
export interface SchoolSessionType {
  id: string;
  code: string;
  label: string;
  description: string | null;
  isSystem: boolean;
  displayOrder: number;
  isActive: boolean;
}

export type ProgramPartnerType = SchoolSessionType; // identical shape

export interface SchoolContactRole extends SchoolSessionType {
  canLoginToPortal: boolean;
}

// ── Entity shapes ───────────────────────────────────────────────────────────
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

export interface ProgramPartnerGrant {
  id: string;
  programPartnerId: string;
  amountInr: number;
  receivedAt: string;
  designatedFor: string;
  invoiceUrl: string | null;
  receiptNo: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── RPC return shapes ───────────────────────────────────────────────────────
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
  totalCount: number;
}

export interface SchoolDetail {
  school: School;
  owners: SchoolJkknOwner[];
  contacts: SchoolContact[];
  recentSessions: SchoolSession[];
  contributionTotals: { count: number; valueInr: number };
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

export interface SchoolSilenceCandidate {
  schoolId: string;
  schoolName: string;
  lastSessionAt: string | null;
  daysSilent: number;
  primaryOwnerUserId: string | null;
}

// ── List / filter parameter shapes ──────────────────────────────────────────
export interface SchoolListParams {
  search?: string;
  ownership?: SchoolOwnership;
  status?: SchoolStatus;
  state?: string;
  district?: string;
  programPartnerId?: string;
  jkknUserId?: string;
  limit?: number;
  offset?: number;
}

// Service-layer alias used by SchoolsService.list. Same shape as
// SchoolListParams — kept distinct because list-filter contracts at the
// service boundary tend to drift from URL-layer params (different defaults,
// optional facet additions). Re-using the type here lets API routes parse the
// search params directly into a ListSchoolsFilters.
export type ListSchoolsFilters = SchoolListParams;

export interface CreateSchoolInput {
  name: string;
  ownership: SchoolOwnership;
  institutionId?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  intakeYear?: number | null;
  status?: SchoolStatus;
  metadata?: Record<string, unknown>;
}

export type UpdateSchoolInput = Partial<CreateSchoolInput>;

export interface RecordSessionInput {
  sessionTypeCode: string;
  conductedAt: string;
  attendeeCount?: number;
  programPartnerId?: string | null;
  topic?: string | null;
  notes?: string | null;
  attachments?: Array<{ url: string; filename: string; mimeType: string }>;
}

export interface RecordContributionInput {
  kind: ContributionKind;
  description: string;
  valueInr?: number | null;
  deliveredAt?: string | null;
  programPartnerId?: string | null;
  evidenceUrl?: string | null;
}

export interface AssignOwnerInput {
  jkknUserId: string;
  role: SchoolOwnerRole;
  programPartnerId?: string | null;
}

export interface CreateProgramPartnerInput {
  name: string;
  typeId: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactPerson?: string | null;
  websiteUrl?: string | null;
  status?: ProgramPartnerStatus;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export type UpdateProgramPartnerInput = Partial<CreateProgramPartnerInput>;

// ── Standard API envelope ───────────────────────────────────────────────────
// Note: project-wide responses use { success, data } | { success: false, error }.
// `lib/api/response.ts` helpers (successResponse / errorResponse) produce that
// shape. The spec's `{ ok }` shape is mapped to `{ success }` for consistency
// with the rest of the codebase.
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  error: string;
  message?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

// ── DB row shapes (snake_case, exact column names) ──────────────────────────
// These mirror the raw select(*) result from supabase and are used internally
// by the service mappers before normalising to camelCase.
export interface SchoolRow {
  id: string;
  name: string;
  ownership: SchoolOwnership;
  institution_id: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  intake_year: number | null;
  status: SchoolStatus;
  status_changed_at: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolContactRow {
  id: string;
  school_id: string;
  role_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  school_contact_roles?: {
    code: string;
    label: string;
  } | null;
}

export interface SchoolJkknOwnerRow {
  id: string;
  school_id: string;
  jkkn_user_id: string;
  role: SchoolOwnerRole;
  program_partner_id: string | null;
  assigned_at: string;
  assigned_by: string | null;
  is_active: boolean;
  profiles?: { full_name: string | null } | null;
  program_partners?: { name: string } | null;
}

export interface SchoolSessionRow {
  id: string;
  school_id: string;
  session_type_id: string;
  conducted_at: string;
  conducted_by_user_id: string | null;
  program_partner_id: string | null;
  attendee_count: number;
  topic: string | null;
  notes: string | null;
  attachments: Array<{ url: string; filename: string; mimeType: string }>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  school_session_types?: { code: string; label: string } | null;
  program_partners?: { name: string } | null;
  profiles?: { full_name: string | null } | null;
}

export interface SchoolContributionRow {
  id: string;
  school_id: string;
  kind: ContributionKind;
  description: string;
  value_inr: number | null;
  delivered_at: string | null;
  program_partner_id: string | null;
  evidence_url: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  program_partners?: { name: string } | null;
}

export interface ProgramPartnerRow {
  id: string;
  name: string;
  type_id: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_person: string | null;
  website_url: string | null;
  status: ProgramPartnerStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  program_partner_types?: { code: string; label: string } | null;
}

// ── program_partner_schools (per-school participation + status) ─────────────
export type AiSessionStatus =
  | 'not_started'
  | 'interested'
  | 'scheduled'
  | 'conducted'
  | 'declined';
export type WebsiteStatus = 'not_started' | 'in_progress' | 'live';

/** Raw DB row (snake_case) with optional embedded school. */
export interface ProgramPartnerSchoolRow {
  id: string;
  program_partner_id: string;
  school_id: string;
  ai_session_status: AiSessionStatus;
  website_status: WebsiteStatus;
  domain_url: string | null;
  branding_done: boolean;
  nan_mudhalvan: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  // PostgREST returns a to-one embed as an object, but some versions wrap it
  // in a single-element array — accept both.
  schools?:
    | { id: string; name: string; district: string | null }
    | Array<{ id: string; name: string; district: string | null }>
    | null;
}

/** Mapped shape returned to the client. */
export interface ProgramPartnerSchool {
  id: string;
  programPartnerId: string;
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

export interface UpsertPartnerSchoolStatusInput {
  schoolId: string;
  aiSessionStatus?: AiSessionStatus;
  websiteStatus?: WebsiteStatus;
  domainUrl?: string | null;
  brandingDone?: boolean;
  nanMudhalvan?: boolean;
}
