// lib/services/events/marathon/marathon-sponsor-service.ts
// BACKWARD-COMPAT SHIM (Events Platform Promotion PR1, 2026-06-23).
// The Sponsorship CRM was promoted to the shared events layer. This path now re-exports the
// canonical EventSponsorService so existing marathon imports (hooks + dashboard) keep working
// unchanged while pointing at the renamed event_sponsors tables. Remove this shim in the cleanup PR.
export { EventSponsorService as MarathonSponsorService } from '@/lib/services/events/shared/event-sponsor-service';
