// lib/services/events/marathon/marathon-core-analytics-service.ts
// BACKWARD-COMPAT / ADOPTION SHIM (Events Platform Promotion PR8). The format-agnostic core
// analytics (registrations, payments, ops progress, breakdowns) were promoted to the shared
// events layer as EventAnalyticsService. The existing MarathonAnalyticsService keeps the
// race-specific pack (pace, DNF, finish times) untouched. This re-export lets marathon code
// reach the shared core metrics under a marathon-scoped name. Remove in the cleanup PR.
export { EventAnalyticsService as MarathonCoreAnalyticsService } from '@/lib/services/events/shared/event-analytics-service';
