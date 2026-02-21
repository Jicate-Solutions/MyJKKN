// types/campus-living.ts
// Campus Living Module — Complete Type Definitions
// Covers: Hostel, Mess, Safety, Analytics (34 tables, 40+ enums)

import type { Json } from './database.types';

// ===================================================================
// ENUMS
// ===================================================================

// ===== HOSTEL ENUMS =====
export const HOSTEL_TYPE = { BOYS: 'boys', GIRLS: 'girls', MIXED: 'mixed' } as const;
export const BLOCK_STATUS = { ACTIVE: 'active', UNDER_MAINTENANCE: 'under_maintenance', CLOSED: 'closed' } as const;
export const ROOM_TYPE = { SINGLE: 'single', DOUBLE: 'double', TRIPLE: 'triple', QUAD: 'quad', DORMITORY: 'dormitory' } as const;
export const AC_STATUS = { AC: 'ac', NON_AC: 'non_ac', COOLER: 'cooler' } as const;
export const ROOM_STATUS = { AVAILABLE: 'available', PARTIALLY_OCCUPIED: 'partially_occupied', FULL: 'full', MAINTENANCE: 'maintenance', RESERVED: 'reserved', CLOSED: 'closed' } as const;
export const BED_STATUS = { AVAILABLE: 'available', OCCUPIED: 'occupied', RESERVED: 'reserved', MAINTENANCE: 'maintenance' } as const;
export const BED_TYPE = { SINGLE: 'single', BUNK_UPPER: 'bunk_upper', BUNK_LOWER: 'bunk_lower' } as const;
export const ALLOCATION_TYPE = { FRESH: 'fresh', RENEWAL: 'renewal', TRANSFER: 'transfer', TEMPORARY: 'temporary' } as const;
export const ALLOCATION_STATUS = { ACTIVE: 'active', VACATED: 'vacated', TRANSFERRED: 'transferred', SUSPENDED: 'suspended' } as const;
export const VACATE_REASON = { GRADUATION: 'graduation', WITHDRAWAL: 'withdrawal', TRANSFER: 'transfer', DISCIPLINARY: 'disciplinary', VOLUNTARY: 'voluntary', SEMESTER_END: 'semester_end' } as const;
export const WARDEN_DESIGNATION = { CHIEF_WARDEN: 'chief_warden', WARDEN: 'warden', DEPUTY_WARDEN: 'deputy_warden', FLOOR_SUPERVISOR: 'floor_supervisor', NIGHT_WATCHER: 'night_watcher' } as const;
export const FOOD_PREFERENCE = { VEGETARIAN: 'vegetarian', NON_VEGETARIAN: 'non_vegetarian', VEGAN: 'vegan', JAIN: 'jain', EGGETARIAN: 'eggetarian' } as const;
export const WARDEN_SHIFT = { DAY: 'day', NIGHT: 'night', FULL_TIME: 'full_time' } as const;

// ===== ATTENDANCE ENUMS =====
export const HOSTEL_ATTENDANCE_STATUS = { PRESENT: 'present', ABSENT: 'absent', ON_LEAVE: 'on_leave', LATE_ENTRY: 'late_entry', MEDICAL: 'medical' } as const;
export const MARKING_METHOD = { MANUAL: 'manual', BIOMETRIC: 'biometric', QR_SCAN: 'qr_scan', RFID: 'rfid' } as const;

// ===== LEAVE ENUMS =====
export const HOSTEL_LEAVE_TYPE = { HOME_VISIT: 'home_visit', WEEKEND: 'weekend', VACATION: 'vacation', EMERGENCY: 'emergency', MEDICAL: 'medical', ACADEMIC: 'academic', NIGHT_OUT: 'night_out' } as const;
export const PARENT_CONSENT_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', NOT_REQUIRED: 'not_required' } as const;
export const PARENT_CONSENT_METHOD = { OTP: 'otp', APP_APPROVAL: 'app_approval', SMS_REPLY: 'sms_reply', IN_PERSON: 'in_person' } as const;
export const LEAVE_STATUS = { DRAFT: 'draft', PENDING_PARENT: 'pending_parent', PENDING_WARDEN: 'pending_warden', PENDING_CHIEF: 'pending_chief', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled', EXPIRED: 'expired' } as const;
export const GATE_PASS_STATUS = { REQUESTED: 'requested', ISSUED: 'issued', ACTIVE: 'active', RETURNED: 'returned', OVERDUE: 'overdue', CANCELLED: 'cancelled', REJECTED: 'rejected' } as const;
export const GATE_PASS_TYPE = { REGULAR_OUT: 'regular_out', OVERNIGHT: 'overnight', EMERGENCY: 'emergency', VISITOR_ACCOMPANIED: 'visitor_accompanied' } as const;

// ===== FEE ENUMS =====
export const FEE_STATUS = { PENDING: 'pending', PARTIAL: 'partial', PAID: 'paid', WAIVED: 'waived' } as const;
export const DEPOSIT_TYPE = { HOSTEL_CAUTION: 'hostel_caution', MESS_CAUTION: 'mess_caution', KEY_DEPOSIT: 'key_deposit', ELECTRICITY_DEPOSIT: 'electricity_deposit' } as const;
export const DEPOSIT_STATUS = { PENDING: 'pending', PAID: 'paid', REFUND_PROCESSING: 'refund_processing', REFUNDED: 'refunded', FORFEITED: 'forfeited' } as const;
export const ELECTRICITY_CHARGES = { INCLUDED: 'included', METERED: 'metered', FIXED_MONTHLY: 'fixed_monthly' } as const;

// ===== VISITOR ENUMS =====
export const VISITOR_STATUS = { CHECKED_IN: 'checked_in', CHECKED_OUT: 'checked_out', REJECTED: 'rejected', CANCELLED: 'cancelled' } as const;
export const VISITOR_GENDER = { MALE: 'male', FEMALE: 'female', OTHER: 'other' } as const;

// ===== MESS ENUMS =====
export const MEAL_TYPE = { BREAKFAST: 'breakfast', LUNCH: 'lunch', SNACKS: 'snacks', DINNER: 'dinner' } as const;
export const BILLING_MODEL = { FIXED_MONTHLY: 'fixed_monthly', PER_MEAL: 'per_meal', BDMR: 'bdmr', SEMESTER_ADVANCE: 'semester_advance' } as const;
export const CATERER_STATUS = { ACTIVE: 'active', CONTRACT_ENDED: 'contract_ended', SUSPENDED: 'suspended', BLACKLISTED: 'blacklisted' } as const;
export const WASTE_CATEGORY = { OVERPRODUCTION: 'overproduction', PLATE_WASTE: 'plate_waste', SPOILAGE: 'spoilage', OTHER: 'other' } as const;
export const BOOKING_STATUS = { BOOKED: 'booked', CANCELLED: 'cancelled', CONSUMED: 'consumed', NO_SHOW: 'no_show' } as const;
export const MENU_STATUS = { PLANNED: 'planned', CONFIRMED: 'confirmed', SERVED: 'served', CANCELLED: 'cancelled' } as const;
export const MESS_BILLING_STATUS = { OPEN: 'open', CLOSED: 'closed', BILLED: 'billed', PAID: 'paid' } as const;
export const PAYMENT_STATUS = { PENDING: 'pending', PAID: 'paid', PARTIAL: 'partial', OVERDUE: 'overdue' } as const;
export const SCAN_METHOD = { QR_CODE: 'qr_code', MANUAL: 'manual', RFID: 'rfid', BIOMETRIC: 'biometric' } as const;

// ===== SAFETY ENUMS =====
export const VISITOR_RELATIONSHIP = { PARENT: 'parent', GUARDIAN: 'guardian', SIBLING: 'sibling', RELATIVE: 'relative', FRIEND: 'friend', OTHER: 'other' } as const;
export const ID_PROOF_TYPE = { AADHAAR: 'aadhaar', DRIVING_LICENSE: 'driving_license', VOTER_ID: 'voter_id', PASSPORT: 'passport', COLLEGE_ID: 'college_id' } as const;
export const MEETING_LOCATION = { GATE: 'gate', COMMON_AREA: 'common_area', ROOM: 'room', GUEST_ROOM: 'guest_room' } as const;
export const MAINTENANCE_CATEGORY = { ELECTRICAL: 'electrical', PLUMBING: 'plumbing', CIVIL: 'civil', PEST_CONTROL: 'pest_control', CLEANING: 'cleaning', INTERNET: 'internet', WATER_SUPPLY: 'water_supply', FURNITURE: 'furniture', SAFETY: 'safety', OTHER: 'other' } as const;
export const MAINTENANCE_STATUS = { OPEN: 'open', ASSIGNED: 'assigned', IN_PROGRESS: 'in_progress', PENDING_VERIFICATION: 'pending_verification', RESOLVED: 'resolved', CLOSED: 'closed', REOPENED: 'reopened' } as const;
export const MAINTENANCE_PRIORITY = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' } as const;
export const SLA_STATUS = { ON_TRACK: 'on_track', AT_RISK: 'at_risk', BREACHED: 'breached' } as const;
export const INCIDENT_TYPE = { RAGGING: 'ragging', THEFT: 'theft', HARASSMENT: 'harassment', MEDICAL_EMERGENCY: 'medical_emergency', FIRE: 'fire', NATURAL_DISASTER: 'natural_disaster', SUBSTANCE_ABUSE: 'substance_abuse', PROPERTY_DAMAGE: 'property_damage', UNAUTHORIZED_ENTRY: 'unauthorized_entry', FIGHT: 'fight', OTHER: 'other' } as const;
export const INCIDENT_SEVERITY = { MINOR: 'minor', MODERATE: 'moderate', MAJOR: 'major', CRITICAL: 'critical' } as const;
export const INCIDENT_STATUS = { REPORTED: 'reported', UNDER_INVESTIGATION: 'under_investigation', ACTION_TAKEN: 'action_taken', CLOSED: 'closed', REOPENED: 'reopened' } as const;
export const DISCIPLINARY_ACTION = { WARNING: 'warning', FINE: 'fine', SUSPENSION: 'suspension', RUSTICATION: 'rustication', FIR_FILED: 'fir_filed', COUNSELING: 'counseling' } as const;
export const INSPECTION_TYPE = { ROUTINE: 'routine', SURPRISE: 'surprise', FIRE_SAFETY: 'fire_safety', HYGIENE: 'hygiene', ANTI_RAGGING: 'anti_ragging', CCTV_CHECK: 'cctv_check', HEALTH: 'health' } as const;
export const AFFIDAVIT_STATUS = { PENDING: 'pending', PARTIAL: 'partial', COMPLETE: 'complete', VERIFIED: 'verified' } as const;

// ===== ROOMMATE PREFERENCES =====
export const SLEEP_SCHEDULE = { EARLY_BIRD: 'early_bird', NIGHT_OWL: 'night_owl', FLEXIBLE: 'flexible' } as const;
export const STUDY_HABITS = { QUIET_STUDIER: 'quiet_studier', GROUP_STUDIER: 'group_studier', LIBRARY_GOER: 'library_goer' } as const;
export const CLEANLINESS_LEVEL = { VERY_TIDY: 'very_tidy', MODERATE: 'moderate', RELAXED: 'relaxed' } as const;
export const NOISE_TOLERANCE = { NEEDS_SILENCE: 'needs_silence', MODERATE: 'moderate', DOESNT_MIND: 'doesnt_mind' } as const;
export const VISITOR_FREQUENCY = { RARELY: 'rarely', SOMETIMES: 'sometimes', OFTEN: 'often' } as const;

// ===== WAITLIST =====
export const WAITLIST_STATUS = { WAITING: 'waiting', OFFERED: 'offered', ACCEPTED: 'accepted', DECLINED: 'declined', EXPIRED: 'expired', ALLOCATED: 'allocated' } as const;

// ===== ACCESS LOG =====
export const ACCESS_LOG_PERSON_TYPE = { STUDENT: 'student', STAFF: 'staff', VISITOR: 'visitor', DELIVERY: 'delivery', UNKNOWN: 'unknown' } as const;
export const ACCESS_LOG_DIRECTION = { ENTRY: 'entry', EXIT: 'exit' } as const;
export const ACCESS_LOG_METHOD = { QR_SCAN: 'qr_scan', RFID: 'rfid', BIOMETRIC: 'biometric', MANUAL: 'manual', CCTV: 'cctv' } as const;

// ===== CURFEW EXCEPTIONS =====
export const CURFEW_EXCEPTION_TYPE = { EXAM_PERIOD: 'exam_period', EVENT: 'event', MEDICAL: 'medical', PERMANENT: 'permanent', ONE_TIME: 'one_time' } as const;

// ===== ALERTS =====
export const ALERT_TYPE = { DROPOUT_RISK: 'dropout_risk', MENTAL_HEALTH: 'mental_health', FEE_DEFAULT: 'fee_default', CATERER_QUALITY: 'caterer_quality', ATTENDANCE_DROP: 'attendance_drop', MEAL_SKIP: 'meal_skip' } as const;
export const ALERT_SEVERITY = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' } as const;
export const ALERT_STATUS = { ACTIVE: 'active', ACKNOWLEDGED: 'acknowledged', RESOLVED: 'resolved', DISMISSED: 'dismissed', FALSE_POSITIVE: 'false_positive' } as const;

// ===== INCIDENT PARTIES =====
export const INCIDENT_PARTY_TYPE = { INVOLVED_STUDENT: 'involved_student', INVOLVED_STAFF: 'involved_staff', WITNESS: 'witness', REPORTER: 'reporter' } as const;


// ===================================================================
// TYPE ALIASES
// ===================================================================

export type HostelType = (typeof HOSTEL_TYPE)[keyof typeof HOSTEL_TYPE];
export type BlockStatus = (typeof BLOCK_STATUS)[keyof typeof BLOCK_STATUS];
export type RoomType = (typeof ROOM_TYPE)[keyof typeof ROOM_TYPE];
export type AcStatus = (typeof AC_STATUS)[keyof typeof AC_STATUS];
export type RoomStatus = (typeof ROOM_STATUS)[keyof typeof ROOM_STATUS];
export type BedStatus = (typeof BED_STATUS)[keyof typeof BED_STATUS];
export type BedType = (typeof BED_TYPE)[keyof typeof BED_TYPE];
export type AllocationType = (typeof ALLOCATION_TYPE)[keyof typeof ALLOCATION_TYPE];
export type AllocationStatus = (typeof ALLOCATION_STATUS)[keyof typeof ALLOCATION_STATUS];
export type VacateReason = (typeof VACATE_REASON)[keyof typeof VACATE_REASON];
export type WardenDesignation = (typeof WARDEN_DESIGNATION)[keyof typeof WARDEN_DESIGNATION];
export type FoodPreference = (typeof FOOD_PREFERENCE)[keyof typeof FOOD_PREFERENCE];
export type WardenShift = (typeof WARDEN_SHIFT)[keyof typeof WARDEN_SHIFT];
export type HostelAttendanceStatus = (typeof HOSTEL_ATTENDANCE_STATUS)[keyof typeof HOSTEL_ATTENDANCE_STATUS];
export type MarkingMethod = (typeof MARKING_METHOD)[keyof typeof MARKING_METHOD];
export type HostelLeaveType = (typeof HOSTEL_LEAVE_TYPE)[keyof typeof HOSTEL_LEAVE_TYPE];
export type ParentConsentStatus = (typeof PARENT_CONSENT_STATUS)[keyof typeof PARENT_CONSENT_STATUS];
export type ParentConsentMethod = (typeof PARENT_CONSENT_METHOD)[keyof typeof PARENT_CONSENT_METHOD];
export type LeaveStatus = (typeof LEAVE_STATUS)[keyof typeof LEAVE_STATUS];
export type GatePassStatus = (typeof GATE_PASS_STATUS)[keyof typeof GATE_PASS_STATUS];
export type GatePassType = (typeof GATE_PASS_TYPE)[keyof typeof GATE_PASS_TYPE];
export type FeeStatus = (typeof FEE_STATUS)[keyof typeof FEE_STATUS];
export type DepositType = (typeof DEPOSIT_TYPE)[keyof typeof DEPOSIT_TYPE];
export type DepositStatus = (typeof DEPOSIT_STATUS)[keyof typeof DEPOSIT_STATUS];
export type ElectricityCharges = (typeof ELECTRICITY_CHARGES)[keyof typeof ELECTRICITY_CHARGES];
export type VisitorStatus = (typeof VISITOR_STATUS)[keyof typeof VISITOR_STATUS];
export type VisitorGender = (typeof VISITOR_GENDER)[keyof typeof VISITOR_GENDER];
export type MealType = (typeof MEAL_TYPE)[keyof typeof MEAL_TYPE];
export type BillingModel = (typeof BILLING_MODEL)[keyof typeof BILLING_MODEL];
export type CatererStatus = (typeof CATERER_STATUS)[keyof typeof CATERER_STATUS];
export type WasteCategory = (typeof WASTE_CATEGORY)[keyof typeof WASTE_CATEGORY];
export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];
export type MenuStatus = (typeof MENU_STATUS)[keyof typeof MENU_STATUS];
export type MessBillingStatus = (typeof MESS_BILLING_STATUS)[keyof typeof MESS_BILLING_STATUS];
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export type ScanMethod = (typeof SCAN_METHOD)[keyof typeof SCAN_METHOD];
export type VisitorRelationship = (typeof VISITOR_RELATIONSHIP)[keyof typeof VISITOR_RELATIONSHIP];
export type IdProofType = (typeof ID_PROOF_TYPE)[keyof typeof ID_PROOF_TYPE];
export type MeetingLocation = (typeof MEETING_LOCATION)[keyof typeof MEETING_LOCATION];
export type MaintenanceCategory = (typeof MAINTENANCE_CATEGORY)[keyof typeof MAINTENANCE_CATEGORY];
export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[keyof typeof MAINTENANCE_STATUS];
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITY)[keyof typeof MAINTENANCE_PRIORITY];
export type SlaStatus = (typeof SLA_STATUS)[keyof typeof SLA_STATUS];
export type IncidentType = (typeof INCIDENT_TYPE)[keyof typeof INCIDENT_TYPE];
export type IncidentSeverity = (typeof INCIDENT_SEVERITY)[keyof typeof INCIDENT_SEVERITY];
export type IncidentStatus = (typeof INCIDENT_STATUS)[keyof typeof INCIDENT_STATUS];
export type DisciplinaryAction = (typeof DISCIPLINARY_ACTION)[keyof typeof DISCIPLINARY_ACTION];
export type InspectionType = (typeof INSPECTION_TYPE)[keyof typeof INSPECTION_TYPE];
export type AffidavitStatus = (typeof AFFIDAVIT_STATUS)[keyof typeof AFFIDAVIT_STATUS];
export type SleepSchedule = (typeof SLEEP_SCHEDULE)[keyof typeof SLEEP_SCHEDULE];
export type StudyHabits = (typeof STUDY_HABITS)[keyof typeof STUDY_HABITS];
export type CleanlinessLevel = (typeof CLEANLINESS_LEVEL)[keyof typeof CLEANLINESS_LEVEL];
export type NoiseTolerance = (typeof NOISE_TOLERANCE)[keyof typeof NOISE_TOLERANCE];
export type VisitorFrequency = (typeof VISITOR_FREQUENCY)[keyof typeof VISITOR_FREQUENCY];
export type WaitlistStatus = (typeof WAITLIST_STATUS)[keyof typeof WAITLIST_STATUS];
export type AccessLogPersonType = (typeof ACCESS_LOG_PERSON_TYPE)[keyof typeof ACCESS_LOG_PERSON_TYPE];
export type AccessLogDirection = (typeof ACCESS_LOG_DIRECTION)[keyof typeof ACCESS_LOG_DIRECTION];
export type AccessLogMethod = (typeof ACCESS_LOG_METHOD)[keyof typeof ACCESS_LOG_METHOD];
export type CurfewExceptionType = (typeof CURFEW_EXCEPTION_TYPE)[keyof typeof CURFEW_EXCEPTION_TYPE];
export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE];
export type AlertSeverity = (typeof ALERT_SEVERITY)[keyof typeof ALERT_SEVERITY];
export type AlertStatus = (typeof ALERT_STATUS)[keyof typeof ALERT_STATUS];
export type IncidentPartyType = (typeof INCIDENT_PARTY_TYPE)[keyof typeof INCIDENT_PARTY_TYPE];


// ===================================================================
// TABLE INTERFACES (all 34 tables)
// ===================================================================

// ----- 1. hostel_blocks -----
export interface HostelBlock {
  id: string;
  institution_id: string;
  name: string;
  code: string;
  hostel_type: HostelType;
  total_floors: number;
  total_rooms: number;
  total_capacity: number;
  current_occupancy: number;
  address: string | null;
  amenities: Record<string, boolean> | null;
  warden_id: string | null;
  deputy_warden_id: string | null;
  contact_phone: string | null;
  curfew_time_weekday: string | null;
  curfew_time_weekend: string | null;
  visiting_hours_start: string | null;
  visiting_hours_end: string | null;
  status: BlockStatus;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ----- 2. hostel_rooms -----
export interface HostelRoom {
  id: string;
  block_id: string;
  institution_id: string;
  room_number: string;
  floor: number;
  room_type: RoomType;
  ac_status: AcStatus;
  capacity: number;
  current_occupancy: number;
  is_accessible: boolean;
  has_attached_bathroom: boolean;
  furniture: Record<string, number> | null;
  annual_fee: number | null;
  status: RoomStatus;
  maintenance_notes: string | null;
  last_inspection_date: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ----- 3. hostel_beds -----
export interface HostelBed {
  id: string;
  room_id: string;
  institution_id: string;
  bed_number: string;
  bed_type: BedType;
  status: BedStatus;
  current_occupant_id: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ----- 4. hostel_wardens -----
export interface HostelWarden {
  id: string;
  institution_id: string;
  staff_id: string;
  user_id: string;
  block_id: string | null;
  designation: WardenDesignation;
  phone: string;
  is_residential: boolean;
  assigned_floors: number[] | null;
  shift: WardenShift | null;
  is_active: boolean;
  assigned_at: string;
  relieved_at: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 5. hostel_allocations -----
export interface HostelAllocation {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  room_id: string;
  bed_id: string;
  academic_year_id: string;
  semester_id: string | null;
  allocation_type: AllocationType;
  allocation_date: string;
  expected_vacate_date: string | null;
  actual_vacate_date: string | null;
  vacate_reason: VacateReason | null;
  status: AllocationStatus;
  fee_status: FeeStatus;
  deposit_paid: number;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  medical_conditions: string | null;
  food_preference: FoodPreference | null;
  roommate_preference_ids: string[] | null;
  allocated_by: string | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ----- 6. hostel_roommate_preferences -----
export interface HostelRoommatePreference {
  id: string;
  learner_id: string;
  institution_id: string;
  academic_year_id: string;
  sleep_schedule: SleepSchedule | null;
  study_habits: StudyHabits | null;
  cleanliness_level: CleanlinessLevel | null;
  noise_tolerance: NoiseTolerance | null;
  visitor_frequency: VisitorFrequency | null;
  is_smoker: boolean;
  language_preference: string | null;
  preferred_roommates: string[] | null;
  avoid_roommates: string[] | null;
  special_requirements: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 7. hostel_attendance -----
export interface HostelAttendance {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  evening_status: HostelAttendanceStatus;
  morning_status: HostelAttendanceStatus | null;
  marked_by: string | null;
  marking_method: MarkingMethod | null;
  is_curfew_violation: boolean;
  late_minutes: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 8. hostel_leave_requests -----
export interface HostelLeaveRequest {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  leave_type: HostelLeaveType;
  from_date: string;
  to_date: string;
  from_time: string | null;
  expected_return_time: string | null;
  actual_return_time: string | null;
  reason: string;
  destination: string;
  destination_address: string | null;
  destination_contact: string | null;
  attachment_url: string | null;
  parent_consent_status: ParentConsentStatus;
  parent_consent_at: string | null;
  parent_consent_method: ParentConsentMethod | null;
  parent_consent_otp: string | null;
  parent_consent_otp_expires_at: string | null;
  warden_approval_status: ParentConsentStatus;
  warden_id: string | null;
  warden_approved_at: string | null;
  warden_remarks: string | null;
  chief_warden_required: boolean;
  chief_warden_status: ParentConsentStatus | null;
  chief_warden_id: string | null;
  status: LeaveStatus;
  is_overdue: boolean;
  overdue_notified: boolean;
  created_at: string;
  updated_at: string;
}

// ----- 9. hostel_gate_passes -----
export interface HostelGatePass {
  id: string;
  institution_id: string;
  learner_id: string;
  leave_request_id: string | null;
  pass_type: GatePassType;
  pass_number: string | null;
  out_time: string | null;
  expected_return: string;
  actual_return: string | null;
  destination: string;
  approved_by: string | null;
  gate_security_out: string | null;
  gate_security_in: string | null;
  status: GatePassStatus;
  qr_code: string | null;
  parent_notified: boolean;
  reason: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 10. mess_caterers -----
export interface MessCaterer {
  id: string;
  institution_id: string;
  name: string;
  owner_name: string;
  phone: string;
  email: string | null;
  fssai_license_number: string | null;
  fssai_expiry_date: string | null;
  gst_number: string | null;
  contract_start_date: string;
  contract_end_date: string;
  contract_amount_monthly: number | null;
  billing_model: BillingModel;
  performance_score: number;
  status: CatererStatus;
  bank_details: Record<string, unknown> | null;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ----- 11. mess_menus -----
export interface MessMenu {
  id: string;
  institution_id: string;
  caterer_id: string;
  block_id: string | null;
  week_start_date: string;
  day_of_week: number;
  meal_type: MealType;
  items: string[];
  special_items: string[] | null;
  dietary_tags: string[] | null;
  estimated_cost_per_plate: number | null;
  is_special_day: boolean;
  special_day_name: string | null;
  status: MenuStatus;
  created_at: string;
  updated_at: string;
}

// ----- 12. mess_meal_records -----
export interface MessMealRecord {
  id: string;
  institution_id: string;
  learner_id: string;
  menu_id: string | null;
  date: string;
  meal_type: MealType;
  consumed: boolean;
  scan_method: ScanMethod | null;
  scan_time: string | null;
  is_guest_meal: boolean;
  guest_name: string | null;
  guest_count: number;
  feedback_rating: number | null;
  feedback_comment: string | null;
  created_at: string;
}

// ----- 13. mess_billing_periods -----
export interface MessBillingPeriod {
  id: string;
  institution_id: string;
  caterer_id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  base_rate_per_day: number | null;
  status: MessBillingStatus;
  created_at: string;
}

// ----- 14. mess_student_billing -----
export interface MessStudentBilling {
  id: string;
  institution_id: string;
  learner_id: string;
  billing_period_id: string;
  total_days: number;
  present_days: number;
  absent_days: number;
  rebate_eligible_days: number;
  gross_amount: number;
  rebate_amount: number;
  extra_meal_charges: number;
  net_amount: number;
  payment_status: PaymentStatus;
  linked_bill_id: string | null;
  created_at: string;
}

// ----- 15. mess_feedback -----
export interface MessFeedback {
  id: string;
  institution_id: string;
  learner_id: string;
  caterer_id: string;
  date: string;
  meal_type: MealType;
  taste_rating: number;
  hygiene_rating: number;
  quantity_rating: number;
  variety_rating: number;
  overall_rating: number;
  comments: string | null;
  photo_urls: string[] | null;
  is_complaint: boolean;
  complaint_ticket_id: string | null;
  created_at: string;
}

// ----- 16. mess_waste_log -----
export interface MessWasteLog {
  id: string;
  institution_id: string;
  caterer_id: string;
  date: string;
  meal_type: MealType;
  prepared_quantity_kg: number;
  consumed_quantity_kg: number;
  waste_quantity_kg: number;
  waste_percentage: number;
  expected_headcount: number | null;
  actual_headcount: number | null;
  cost_of_waste: number | null;
  waste_category: WasteCategory | null;
  corrective_action: string | null;
  logged_by: string;
  created_at: string;
}

// ----- 17. mess_meal_bookings -----
export interface MessMealBooking {
  id: string;
  institution_id: string;
  learner_id: string;
  date: string;
  meal_type: MealType;
  status: BookingStatus;
  is_opt_out: boolean;
  booking_time: string;
  cancellation_time: string | null;
  cancellation_deadline: string | null;
  created_at: string;
}

// ----- 18. hostel_visitors -----
export interface HostelVisitor {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_relationship: VisitorRelationship;
  visitor_gender: VisitorGender;
  id_proof_type: IdProofType | null;
  id_proof_number: string | null;
  visitor_photo_url: string | null;
  purpose: string;
  number_of_visitors: number;
  check_in_time: string;
  check_out_time: string | null;
  meeting_location: MeetingLocation;
  approved_by: string | null;
  is_overnight_stay: boolean;
  guest_room_id: string | null;
  vehicle_number: string | null;
  items_brought: string | null;
  status: VisitorStatus;
  rejection_reason: string | null;
  created_at: string;
}

// ----- 19. hostel_maintenance_requests -----
export interface HostelMaintenanceRequest {
  id: string;
  institution_id: string;
  learner_id: string;
  block_id: string;
  room_id: string | null;
  request_number: string;
  category: MaintenanceCategory;
  subcategory: string | null;
  title: string;
  description: string;
  priority: MaintenancePriority;
  photo_urls_before: string[] | null;
  photo_urls_after: string[] | null;
  status: MaintenanceStatus;
  assigned_to_name: string | null;
  assigned_to_phone: string | null;
  assigned_at: string | null;
  sla_hours: number;
  sla_deadline: string;
  sla_status: SlaStatus;
  resolution_notes: string | null;
  resolved_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  student_satisfaction: number | null;
  escalation_level: number;
  linked_grievance_id: string | null;
  cost_estimate: number | null;
  actual_cost: number | null;
  vendor_name: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 20. hostel_incidents -----
export interface HostelIncident {
  id: string;
  institution_id: string;
  block_id: string;
  incident_number: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  title: string;
  description: string;
  location: string;
  incident_date: string;
  reported_by: string;
  reported_at: string;
  involved_students: string[] | null;
  involved_staff: string[] | null;
  witness_ids: string[] | null;
  evidence_urls: string[] | null;
  immediate_action: string | null;
  investigation_notes: string | null;
  action_taken: string | null;
  disciplinary_action: DisciplinaryAction | null;
  police_complaint_filed: boolean;
  police_complaint_number: string | null;
  parent_notified: boolean;
  parent_notified_at: string | null;
  status: IncidentStatus;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 21. anti_ragging_affidavits -----
export interface AntiRaggingAffidavit {
  id: string;
  institution_id: string;
  learner_id: string;
  academic_year_id: string;
  student_affidavit_submitted: boolean;
  student_affidavit_date: string | null;
  student_affidavit_url: string | null;
  parent_affidavit_submitted: boolean;
  parent_affidavit_date: string | null;
  parent_affidavit_url: string | null;
  verified_by: string | null;
  verified_at: string | null;
  status: AffidavitStatus;
  created_at: string;
}

// ----- 22. hostel_inspections -----
export interface HostelInspection {
  id: string;
  institution_id: string;
  block_id: string;
  inspection_type: InspectionType;
  inspector_id: string;
  inspection_date: string;
  rooms_inspected: string[] | null;
  findings: string;
  score: number | null;
  issues_found: Record<string, unknown>[] | null;
  follow_up_required: boolean;
  follow_up_deadline: string | null;
  follow_up_completed: boolean;
  report_url: string | null;
  created_at: string;
}

// ----- 23. hostel_fee_config -----
export interface HostelFeeConfig {
  id: string;
  institution_id: string;
  academic_year_id: string;
  room_type: RoomType;
  ac_status: AcStatus;
  annual_fee: number;
  semester_fee: number | null;
  monthly_fee: number | null;
  deposit_amount: number;
  mess_fee_monthly: number | null;
  mess_fee_semester: number | null;
  electricity_charges: ElectricityCharges | null;
  electricity_fixed_amount: number | null;
  is_active: boolean;
  created_at: string;
}

// ----- 24. hostel_deposits -----
export interface HostelDeposit {
  id: string;
  institution_id: string;
  learner_id: string;
  allocation_id: string;
  deposit_type: DepositType;
  amount: number;
  paid_date: string | null;
  payment_reference: string | null;
  refund_date: string | null;
  deductions: number;
  deduction_notes: string | null;
  refund_amount: number | null;
  refund_reference: string | null;
  status: DepositStatus;
  created_at: string;
}

// ----- 25. mess_caterer_blocks -----
export interface MessCatererBlock {
  id: string;
  institution_id: string;
  caterer_id: string;
  block_id: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

// ----- 26. hostel_incident_parties -----
export interface HostelIncidentParty {
  id: string;
  incident_id: string;
  institution_id: string;
  person_id: string;
  party_type: IncidentPartyType;
  name: string | null;
  statement: string | null;
  created_at: string;
}

// ----- 27. hostel_waitlist -----
export interface HostelWaitlist {
  id: string;
  institution_id: string;
  learner_id: string;
  academic_year_id: string;
  preferred_block_id: string | null;
  preferred_room_type: RoomType | null;
  preferred_ac_status: AcStatus | null;
  priority_score: number;
  status: WaitlistStatus;
  offered_at: string | null;
  offer_expires_at: string | null;
  allocated_allocation_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 28. hostel_access_log -----
export interface HostelAccessLog {
  id: string;
  institution_id: string;
  block_id: string;
  person_type: AccessLogPersonType;
  person_id: string | null;
  person_name: string | null;
  direction: AccessLogDirection;
  method: AccessLogMethod;
  timestamp: string;
  gate_id: string | null;
  device_id: string | null;
  photo_url: string | null;
  is_flagged: boolean;
  flag_reason: string | null;
  metadata: Json | null;
  created_at: string;
}

// ----- 29. hostel_known_visitors -----
export interface HostelKnownVisitor {
  id: string;
  institution_id: string;
  learner_id: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_relationship: VisitorRelationship;
  visitor_gender: VisitorGender;
  id_proof_type: IdProofType | null;
  id_proof_number: string | null;
  photo_url: string | null;
  is_active: boolean;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 30. hostel_curfew_exceptions -----
export interface HostelCurfewException {
  id: string;
  institution_id: string;
  block_id: string | null;
  exception_type: CurfewExceptionType;
  title: string;
  description: string | null;
  new_curfew_time: string;
  start_date: string;
  end_date: string | null;
  applies_to_learner_ids: string[] | null;
  approved_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ----- 31. hostel_alert_rules -----
export interface HostelAlertRule {
  id: string;
  institution_id: string;
  alert_type: AlertType;
  name: string;
  description: string | null;
  conditions: Record<string, unknown>;
  severity: AlertSeverity;
  is_active: boolean;
  cooldown_hours: number;
  notify_roles: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ----- 32. hostel_risk_alerts -----
export interface HostelRiskAlert {
  id: string;
  institution_id: string;
  alert_rule_id: string | null;
  alert_type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  learner_id: string | null;
  block_id: string | null;
  trigger_data: Record<string, unknown> | null;
  status: AlertStatus;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

// ----- 33. hostel_leave_type_config -----
export interface HostelLeaveTypeConfig {
  id: string;
  institution_id: string;
  leave_type: HostelLeaveType;
  max_duration_days: number | null;
  requires_parent_consent: boolean;
  advance_notice_hours: number | null;
  requires_chief_warden: boolean;
  requires_attachment: boolean;
  is_active: boolean;
  metadata: Json | null;
  created_at: string;
  updated_at: string;
}

// ----- 34. hostel_maintenance_sla_config -----
export interface HostelMaintenanceSlaConfig {
  id: string;
  institution_id: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  sla_hours: number;
  escalation_after_hours: number | null;
  escalation_to_role: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}


// ===================================================================
// DTO TYPES (for create/update operations)
// ===================================================================

export type CreateHostelBlockDTO = Omit<HostelBlock, 'id' | 'total_rooms' | 'total_capacity' | 'current_occupancy' | 'created_at' | 'updated_at'>;
export type UpdateHostelBlockDTO = Partial<CreateHostelBlockDTO>;

export type CreateHostelRoomDTO = Omit<HostelRoom, 'id' | 'current_occupancy' | 'created_at' | 'updated_at'>;
export type UpdateHostelRoomDTO = Partial<CreateHostelRoomDTO>;

export type CreateHostelBedDTO = Omit<HostelBed, 'id' | 'created_at' | 'updated_at'>;
export type UpdateHostelBedDTO = Partial<CreateHostelBedDTO>;

export type CreateHostelWardenDTO = Omit<HostelWarden, 'id' | 'created_at' | 'updated_at'>;
export type UpdateHostelWardenDTO = Partial<CreateHostelWardenDTO>;

export type CreateHostelAllocationDTO = Omit<HostelAllocation, 'id' | 'actual_vacate_date' | 'vacate_reason' | 'created_at' | 'updated_at'>;
export type UpdateHostelAllocationDTO = Partial<CreateHostelAllocationDTO>;

export type CreateHostelRoommatePreferenceDTO = Omit<HostelRoommatePreference, 'id' | 'created_at' | 'updated_at'>;

export type CreateHostelAttendanceDTO = Omit<HostelAttendance, 'id' | 'created_at' | 'updated_at'>;

export type CreateHostelLeaveRequestDTO = Omit<HostelLeaveRequest, 'id' | 'parent_consent_at' | 'parent_consent_otp' | 'parent_consent_otp_expires_at' | 'warden_approved_at' | 'warden_remarks' | 'chief_warden_id' | 'actual_return_time' | 'is_overdue' | 'overdue_notified' | 'created_at' | 'updated_at'>;

export type CreateHostelGatePassDTO = Omit<HostelGatePass, 'id' | 'actual_return' | 'gate_security_out' | 'gate_security_in' | 'created_at' | 'updated_at'>;

export type CreateMessCatererDTO = Omit<MessCaterer, 'id' | 'performance_score' | 'created_at' | 'updated_at'>;
export type UpdateMessCatererDTO = Partial<CreateMessCatererDTO>;

export type CreateMessMenuDTO = Omit<MessMenu, 'id' | 'created_at' | 'updated_at'>;

export type CreateMessMealRecordDTO = Omit<MessMealRecord, 'id' | 'created_at'>;

export type CreateMessFeedbackDTO = Omit<MessFeedback, 'id' | 'created_at'>;

export type CreateMessWasteLogDTO = Omit<MessWasteLog, 'id' | 'created_at'>;

export type CreateHostelVisitorDTO = Omit<HostelVisitor, 'id' | 'check_out_time' | 'created_at'>;

export type CreateHostelMaintenanceRequestDTO = Omit<HostelMaintenanceRequest, 'id' | 'request_number' | 'photo_urls_after' | 'assigned_to_name' | 'assigned_to_phone' | 'assigned_at' | 'sla_status' | 'resolution_notes' | 'resolved_at' | 'verified_by' | 'verified_at' | 'student_satisfaction' | 'escalation_level' | 'linked_grievance_id' | 'actual_cost' | 'vendor_name' | 'created_at' | 'updated_at'>;

export type CreateHostelIncidentDTO = Omit<HostelIncident, 'id' | 'incident_number' | 'investigation_notes' | 'action_taken' | 'disciplinary_action' | 'closed_by' | 'closed_at' | 'created_at' | 'updated_at'>;

export type CreateAntiRaggingAffidavitDTO = Omit<AntiRaggingAffidavit, 'id' | 'verified_by' | 'verified_at' | 'created_at'>;

export type CreateHostelInspectionDTO = Omit<HostelInspection, 'id' | 'follow_up_completed' | 'created_at'>;

// Filter types for service queries
export interface BlockFilters {
  hostel_type?: HostelType;
  status?: BlockStatus;
  search?: string;
}

export interface RoomFilters {
  block_id?: string;
  room_type?: RoomType;
  ac_status?: AcStatus;
  status?: RoomStatus;
  floor?: number;
}

export interface AllocationFilters {
  block_id?: string;
  status?: AllocationStatus;
  academic_year_id?: string;
  fee_status?: FeeStatus;
  search?: string;
}

export interface AttendanceFilters {
  block_id?: string;
  date?: string;
  status?: HostelAttendanceStatus;
}

export interface LeaveFilters {
  block_id?: string;
  status?: LeaveStatus;
  leave_type?: HostelLeaveType;
  learner_id?: string;
}

export interface MaintenanceFilters {
  block_id?: string;
  category?: MaintenanceCategory;
  priority?: MaintenancePriority;
  status?: MaintenanceStatus;
  sla_status?: SlaStatus;
}

export interface VisitorFilters {
  block_id?: string;
  status?: VisitorStatus;
  date?: string;
}

export interface IncidentFilters {
  block_id?: string;
  incident_type?: IncidentType;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
}

export interface MealRecordFilters {
  date?: string;
  meal_type?: MealType;
  learner_id?: string;
}
