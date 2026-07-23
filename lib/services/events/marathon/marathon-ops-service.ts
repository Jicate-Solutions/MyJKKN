// lib/services/events/marathon/marathon-ops-service.ts
// Marathon event-day ops service. The check-in / scan / stats / search logic was promoted to the shared
// EventOpsService (Events Platform Promotion PR5) so it works for any event type. MarathonOpsService now
// extends that shared service, so every existing marathon import + call site keeps working unchanged.
// Created: 2026-04-11 — Promoted: 2026-06-23

import { EventOpsService } from '@/lib/services/events/shared/event-ops-service';

// ============================================================================
// Service
// ============================================================================

/**
 * Marathon-flavoured alias of the shared EventOpsService. No marathon-specific overrides today —
 * BIB-based check-in, t-shirt and certificate scans are all event-generic. Add marathon-only methods
 * here if/when they appear; the shared logic lives in EventOpsService.
 */
export class MarathonOpsService extends EventOpsService {}
