/**
 * FreeRADIUS 3.2 rlm_rest wire format for a NetworkDecision.
 *
 * Verified against the FreeRADIUS 3.2.x sources and module documentation:
 *   - https://raw.githubusercontent.com/FreeRADIUS/freeradius-server/v3.2.x/raddb/mods-available/rest
 *     Response JSON is a map of "<attribute>": "<value>" (or an object with
 *     value/op); HTTP 2xx = ok/updated (body decoded into attributes),
 *     401 = reject, 403 = userlock, 404/410 = notfound, 5xx = fail.
 *   - https://raw.githubusercontent.com/FreeRADIUS/freeradius-server/v3.2.x/src/modules/rlm_rest/rest.c
 *     json_pair_make() calls tmpl_from_attr_str(..., PAIR_LIST_REPLY, ...), so
 *     an attribute name with no "list:" prefix lands in the REPLY list, and
 *     scalar values go through json_object_get_string(), so integers are fine.
 *   - https://www.freeradius.org/documentation/ (module index, rlm_rest)
 *
 * This is exactly the shape the May 2026 smoke test accepted (vault note
 * Smoke-Test-RADIUS-2026-05-09): 200 + {"Mikrotik-Rate-Limit": "50M/25M",
 * "Mikrotik-Group": "tier_a_learner", "Session-Timeout": 28800} for an
 * accept, HTTP 401 for a reject. The May mock sent an empty 401 body; this
 * module adds a Reply-Message with the reason, and the 2026-09-06 harness run
 * proved rlm_rest still decodes a 401 body into the reply list, so the
 * Access-Reject carries `Reply-Message = "fee_overdue"` for the hotspot page.
 */
import type { NetworkDecision, NetworkDecisionTier, RlmRestReply } from '@/types/network';

/** MikroTik Rate-Limit "rx/tx" as the hotspot expects: download first, then upload. */
export function formatMikrotikRateLimit(tier: NetworkDecisionTier): string {
  return `${tier.downloadMbps}M/${tier.uploadMbps}M`;
}

export function toRlmRestReply(decision: NetworkDecision): RlmRestReply {
  if (!decision.accept) {
    return {
      status: 401,
      body: { 'Reply-Message': decision.reason ?? 'rejected' },
    };
  }

  const body: Record<string, string | number> = {};
  if (decision.tier) {
    body['Mikrotik-Rate-Limit'] = formatMikrotikRateLimit(decision.tier);
  }
  if (decision.group) {
    body['Mikrotik-Group'] = decision.group;
  }
  if (decision.sessionTimeoutSeconds !== undefined) {
    body['Session-Timeout'] = decision.sessionTimeoutSeconds;
  }
  return { status: 200, body };
}
