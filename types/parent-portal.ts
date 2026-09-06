/**
 * Parent Portal — shared TypeScript contracts.
 *
 * Phase A1 subset (session, children, profile). Later phases append their own
 * entity/DTO/filter types here following the same camelCase shape.
 *
 * Code identifiers stay learner-centered (jkkn-terminologies); parent-FACING UI
 * copy may say "Student"/"Marks" (the spec's legal/clarity exception).
 */

// ── Session & Children ──────────────────────────────────────────────
export type ParentType = 'father' | 'mother' | 'guardian';

export type EntityType = 'school' | 'institution';

export interface ParentSession {
  parentAccountId: string;
  mobile: string;
  parentType?: ParentType; // not meaningful in the per-student model
  displayName?: string;
}

export interface ParentChild {
  learnerProfileId: string;
  institutionsId: string;
  institutionName: string;
  entityType: EntityType; // drives school/college label adaptation + tile visibility
  admissionNumber: string;
  fullName: string;
  photoUrl?: string;
  institutionLogoUrl?: string; // /public/logo asset by counselling_code
  className?: string; // program (school label = "Class")
  sectionName?: string;
  relationship: ParentType;
  isPrimary: boolean;
}

// ── Profile ─────────────────────────────────────────────────────────
export interface LearnerProfileView {
  admissionNumber: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: string;
  className?: string;
  sectionName?: string;
  branch?: string;
  address?: string;
  photoUrl?: string;
}

export interface ParentDetailsView {
  fatherName?: string;
  motherName?: string;
  primaryMobile?: string;
  secondaryMobile?: string;
  email?: string;
}

export interface ParentProfileResponse {
  learner: LearnerProfileView;
  parents: ParentDetailsView;
}

// ── Auth API payloads ───────────────────────────────────────────────
export type OtpPurpose = 'register' | 'login' | 'reset' | 'add_sibling';

export interface LoginPayload {
  identifier: string; // admission number OR mobile
  password: string;
}

export interface SendOtpPayload {
  mobile: string;
  admission?: string; // required for register / add_sibling
  purpose: OtpPurpose;
}

export interface RegisterPayload {
  mobile: string;
  admission: string;
  otp: string;
  password: string;
  /** learner ids the parent chose to also link (siblings sharing the mobile) */
  linkSiblingIds?: string[];
}

export interface ForgotPayload {
  mobile: string;
  otp: string;
  password: string;
}

/** A sibling candidate offered during registration / add-sibling. */
export interface SiblingCandidate {
  learnerProfileId: string;
  fullName: string;
  admissionNumber: string;
  institutionsId: string;
}

export interface ParentListResponse<T> {
  data: T[];
  metadata: { total: number; page: number; limit: number; totalPages: number };
}

// ── Attendance (Phase A2) ───────────────────────────────────────────
// Mirrors the student-facing "My Attendance" calc (StudentAttendanceService):
// PERIOD/class based — each marking is one class. So the parent sees exactly
// the same numbers the learner does. Scoped to the learner's semester via the
// semester's timetables (incl. the section_id-in-JSONB fallback).
export interface AttendanceSummary {
  semesterId?: string;
  totalClasses: number;
  present: number;
  absent: number;
  percentage: number;
  threshold: number;
  isAboveThreshold: boolean;
  recentMissed: Array<{ date: string; status: 'absent' | 'on_duty' }>;
}

// ── Fees (Phase A2) ─────────────────────────────────────────────────
export interface FeeBill {
  id: string;
  description: string;
  categoryName?: string;
  totalAmount: number;
  balanceAmount: number;
  dueDate?: string;
  status?: string;
}

export interface FeeReceipt {
  id: string;
  receiptNumber: string;
  amount: number;
  paidDate?: string;
  mode?: string;
  reference?: string;
}

export interface FeesResponse {
  learnerName: string;
  admissionNumber: string;
  primaryMobile?: string;
  email?: string;
  totalDue: number;
  currency: string;
  bills: FeeBill[];
  receipts: FeeReceipt[];
}

export interface PayPayload {
  learnerId: string;
  billIds: string[];
  billAmounts?: Record<string, number>;
}

export interface PayResponse {
  paymentUrl: string;
  transactionId: string;
  provider: string;
}

// ── Announcements (Phase A2) ────────────────────────────────────────
export interface Announcement {
  id: string;
  title: string;
  body?: string;
  category?: string;
  bannerUrl?: string;
  linkUrl?: string;
  attachmentUrls?: Attachment[];
  publishedAt: string;
}

// ── Attachments ─────────────────────────────────────────────────────
export interface Attachment {
  name: string;
  driveFileId?: string;
  url?: string;
}

// ── Homework (A3) ───────────────────────────────────────────────────
export type HomeworkStatus = 'pending' | 'submitted' | 'marked' | 'returned' | 'late';

export interface HomeworkSubmission {
  id: string;
  status: HomeworkStatus;
  submittedAt?: string;
  submissionText?: string;
  attachmentUrls: Attachment[];
  marks?: number;
  feedback?: string;
}

export interface Homework {
  id: string;
  subject?: string;
  title: string;
  instructions?: string;
  attachmentUrls: Attachment[];
  assignedOn: string;
  dueDate?: string;
  maxMarks?: number;
  requiresSubmission: boolean;
  submission?: HomeworkSubmission;
}

// ── Achievements (A4) ───────────────────────────────────────────────
export interface Achievement {
  id: string;
  title: string;
  description?: string;
  category?: string;
  achievedOn?: string;
  certificateUrl?: string;
  attachmentUrls?: Attachment[];
}

// ── Opinion Poll (A4) ───────────────────────────────────────────────
export interface PollOption {
  id: string;
  label: string;
}
export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  closesAt?: string;
  isClosed: boolean;
  myOptionId?: string; // the option this parent/child already chose
  results?: Record<string, number>; // option_id → count (shown after voting/close)
  totalVotes: number;
}
export interface VotePayload {
  learnerId: string;
  pollId: string;
  optionId: string;
}

// ── Parent Concerns (A4) ────────────────────────────────────────────
export type ConcernStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export interface Concern {
  id: string;
  category?: string;
  subject: string;
  status: ConcernStatus;
  priority: 'low' | 'normal' | 'high';
  createdAt: string;
  updatedAt: string;
}
export interface ConcernMessage {
  id: string;
  senderType: 'parent' | 'staff';
  message: string;
  attachmentUrls: Attachment[];
  createdAt: string;
}
export interface ConcernThread extends Concern {
  messages: ConcernMessage[];
}
export interface CreateConcernPayload {
  learnerId: string;
  category: string;
  subject: string;
  message: string;
}
export const CONCERN_CATEGORIES = [
  'fees_billing',
  'learning_academics',
  'learning_studio_infrastructure',
  'food_water',
  'transport_bus',
  'learner_wellbeing_health',
  'uniform_materials',
  'records_personal_details',
  'hygiene_washroom',
  'gps_tracking',
  'attendance',
  'other',
] as const;

// ── Events & Gallery (A4) ───────────────────────────────────────────
export interface EventItem {
  id: string;
  title: string;
  description?: string;
  eventDate?: string;
  venue?: string;
  bannerUrl?: string;
  gallery: GalleryItem[];
}
export interface GalleryItem {
  id: string;
  title?: string;
  mediaType: 'image' | 'video';
  url?: string;
  thumbnailUrl?: string;
}

// ── Spotlight (A4) ──────────────────────────────────────────────────
export interface SpotlightItem {
  id: string;
  title: string;
  body?: string;
  mediaUrl?: string;
  linkUrl?: string;
}

// ── Wellness (A4) ───────────────────────────────────────────────────
export interface WellnessRecord {
  id: string;
  recordDate?: string;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  visionLeft?: string;
  visionRight?: string;
  remarks?: string;
}

// ── Notifications center (A4) ───────────────────────────────────────
export interface ParentNotification {
  id: string;
  title?: string;
  body?: string;
  category?: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

// ── Bus (A5) ────────────────────────────────────────────────────────
export interface BusInfo {
  routeName: string;
  busNumber?: string;
  driverName?: string;
  driverContact?: string;
  stopName?: string;
  stops: Array<{ name?: string; pickup_time?: string; drop_time?: string }>;
}

// ── Gate Pass + Leaves (A5) ─────────────────────────────────────────
export type GatePassType = 'early_leave' | 'late_arrival' | 'outpass' | 'medical';
export interface GatePass {
  id: string;
  passType?: GatePassType;
  reason: string;
  requestedDate: string;
  requestedTime?: string;
  status: 'requested' | 'approved' | 'rejected' | 'used' | 'expired';
  qrToken?: string;
}
export interface CreateGatePassPayload {
  learnerId: string;
  passType: GatePassType;
  reason: string;
  requestedDate: string;
  requestedTime?: string;
  pickupMemberId?: string;
}
export type LeaveType = 'sick' | 'casual' | 'emergency' | 'on_duty' | 'planned_family';
export interface LeaveRequest {
  id: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'cancelled';
}
export interface CreateLeavePayload {
  learnerId: string;
  leaveType: LeaveType;
  fromDate: string;
  toDate: string;
  reason: string;
}

// ── Pickup members (A5) ─────────────────────────────────────────────
export interface PickupMember {
  id: string;
  name: string;
  relationship?: string;
  contactNo?: string;
  photoUrl?: string;
}
export interface CreatePickupMemberPayload {
  name: string;
  relationship?: string;
  contactNo?: string;
  learnerId?: string;
}

// ── Feedback (A5) ───────────────────────────────────────────────────
export type FeedbackType = 'issue' | 'improvement' | 'appreciation' | 'question' | 'rating';
export interface CreateFeedbackPayload {
  type: FeedbackType;
  rating?: number;
  message?: string;
}

// ── Add sibling (A5) ────────────────────────────────────────────────
export interface AddSiblingPayload {
  admission: string;
  otp: string;
}

// ── Parent-facing label map (UI copy; not code identifiers) ─────────
// Centralizes the strings the parent UI shows so school/college wording stays
// in sync. School entityType pulls the K-12 word; default is the college word.
export const PARENT_PORTAL_LABELS = {
  school: {
    program: 'Class',
    semester: 'Term',
    course: 'Subject',
    learner: 'Student',
  },
  institution: {
    program: 'Program',
    semester: 'Semester',
    course: 'Course',
    learner: 'Student',
  },
} as const;

export function parentLabel(
  entityType: EntityType,
  key: keyof (typeof PARENT_PORTAL_LABELS)['school']
): string {
  return PARENT_PORTAL_LABELS[entityType][key];
}
