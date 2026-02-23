// Campus Living Module — Service Layer Index
// All 27 services re-exported for clean imports

// ── Hostel Core ─────────────────────────────────────────────────────
export { HostelBlockService } from './hostel-block-service';
export { HostelRoomService } from './hostel-room-service';
export { HostelBedService } from './hostel-bed-service';
export { HostelAllocationService } from './hostel-allocation-service';
export { HostelWardenService } from './hostel-warden-service';

// ── Hostel Operations ───────────────────────────────────────────────
export { HostelAttendanceService } from './hostel-attendance-service';
export { HostelLeaveService } from './hostel-leave-service';
export { GatePassService } from './gate-pass-service';
export { RoommateMatchingService } from './roommate-matching-service';
export { HostelWaitlistService } from './hostel-waitlist-service';

// ── Mess Management ─────────────────────────────────────────────────
export { MessCatererService } from './mess-caterer-service';
export { MessMenuService } from './mess-menu-service';
export { MessMealService } from './mess-meal-service';
export { MessBillingService } from './mess-billing-service';
export { MessFeedbackService } from './mess-feedback-service';
export { MessWasteService } from './mess-waste-service';

// ── Safety & Security ───────────────────────────────────────────────
export { VisitorService } from './visitor-service';
export { MaintenanceService } from './maintenance-service';
export { IncidentService } from './incident-service';
export { AntiRaggingService } from './anti-ragging-service';
export { InspectionService } from './inspection-service';
export { PmScheduleService } from './pm-schedule-service';
export { HostelAlertService } from './hostel-alert-service';
export { OnboardingService } from './onboarding-service';
export { WellnessService } from './wellness-service';
export { LaundryService } from './laundry-service';
export { AmcService } from './amc-service';
export { HousekeepingService } from './housekeeping-service';
export { HealthService } from './health-service';
export { DashboardService } from './dashboard-service';

// ── Cross-Domain ────────────────────────────────────────────────────
export { CampusLivingAnalytics } from './campus-living-analytics';
export { CampusLivingDashboard } from './campus-living-dashboard';
export { CampusLivingSettings } from './campus-living-settings';
export { CampusLivingReports } from './campus-living-reports';
export { CampusLivingAccessLog } from './campus-living-access-log';
