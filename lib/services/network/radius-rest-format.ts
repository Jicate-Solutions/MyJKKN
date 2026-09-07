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
 * module adds a Reply-Message with the reason. rlm_rest decodes a 401 body
 * into the reply list (rest.c: the `case 401:` arm calls rest_response_decode()
 * before returning RLM_MODULE_REJECT), and scripts/network/radius-smoke/run.sh
 * asserts `Reply-Message = "fee_overdue"` / `"locked_out"` on the two reject
 * fixtures so the committed harness proves it on every run.
 *
 * NOTE: the May 2026 value "50M/25M" was accepted by the router but its
 * DIRECTION was never checked — a router accepts any well-formed pair. See
 * formatMikrotikRateLimit() for the documented order (upload first).
 *
 * Reply-Message security note (reviewer round 2): the value is always one of
 * the fixed NetworkRejectReason enum members, never free text or data about
 * the person. The human-readable explanation (spec Part 3) is resolved on
 * wifi.jkkn.ai/blocked after the person signs in there, not over RADIUS.
 */
import type { NetworkDecision, NetworkDecisionTier, RlmRestReply } from '@/types/network';

/**
 * MikroTik Rate-Limit is "rx-rate[/tx-rate] ..." and the rates are read "from
 * the point of view of the router (so "rx" is client upload, and "tx" is
 * client download)" — https://help.mikrotik.com/docs/display/ROS/RADIUS
 * (Mikrotik-Rate-Limit attribute; the HotSpot user-profile rate-limit
 * property uses the same wording). So the client's UPLOAD goes first and the
 * DOWNLOAD second: tier_a (50 down / 25 up) is "25M/50M".
 */
export function formatMikrotikRateLimit(tier: NetworkDecisionTier): string {
  return `${tier.uploadMbps}M/${tier.downloadMbps}M`;
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
