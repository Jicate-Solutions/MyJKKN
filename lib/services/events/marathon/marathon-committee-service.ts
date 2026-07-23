// lib/services/events/marathon/marathon-committee-service.ts
// BACKWARD-COMPAT SHIM (Events Platform Promotion PR3). Committees + tasks were promoted to the shared
// events layer; this re-exports the canonical EventCommitteeService (reading event_committees/event_tasks)
// so existing marathon imports keep working unchanged. Remove in the cleanup PR.
export { EventCommitteeService as MarathonCommitteeService } from '@/lib/services/events/shared/event-committee-service';
