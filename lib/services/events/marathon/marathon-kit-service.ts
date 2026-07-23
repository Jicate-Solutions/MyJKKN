// lib/services/events/marathon/marathon-kit-service.ts
// BACKWARD-COMPAT SHIM (Events Platform Promotion PR8). Kit/t-shirt distribution was generalized to the
// shared events layer (EventKitService, reading the tshirt_collected* columns on events_registrations).
// This re-export lets marathon code reach it under a marathon-scoped name. Remove in the cleanup PR.
export { EventKitService as MarathonKitService } from '@/lib/services/events/shared/event-kit-service';
