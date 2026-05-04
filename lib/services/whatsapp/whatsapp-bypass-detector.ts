// lib/services/whatsapp/whatsapp-bypass-detector.ts
//
// Spec 3 H3.2: Weekly bypass-detector. For each dept's connection over the
// last 7 days, computes inbound:outbound ratio. A very low ratio (<0.05)
// suggests bypass: the HoD is sending FROM the dept WhatsApp but inbound
// messages are going elsewhere (e.g., HoD using personal phone for replies),
// which means we're losing inbound capture for that dept.
//
// Returns flagged depts; caller decides surfacing (digest, Sentry, email).
//
// Spec: /specs/byow-platform-v2.md §8 H3.2

import { SupabaseClient } from '@supabase/supabase-js';

const BYPASS_RATIO_THRESHOLD = 0.05; // <5% inbound:outbound = likely bypass
const MIN_OUTBOUND_FOR_FLAG = 10; // need at least 10 outbound to make ratio meaningful

export interface BypassDeptRow {
  connection_id: string;
  department_id: string;
  department_name: string | null;
  inbound_7d: number;
  outbound_7d: number;
  ratio: number; // inbound / outbound
}

export interface BypassDetectionSummary {
  total_depts_checked: number;
  flagged: BypassDeptRow[];
}

export async function runBypassDetector(
  supabase: SupabaseClient
): Promise<BypassDetectionSummary> {
  const cutoff7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  // Filter unprocessable rows (zero msgs in window) BEFORE the limit per
  // CLAUDE.md cap-policy rule. The aggregation here is small enough to
  // not need a hard LIMIT, but we still skip dead connections at the SELECT.
  const { data: connections, error: connErr } = await supabase
    .from('wa_personal_connections')
    .select('id, department_id, departments:department_id ( department_name )')
    .neq('status', 'disconnected');

  if (connErr) throw connErr;

  type ConnRow = {
    id: string;
    department_id: string;
    departments: { department_name: string } | null;
  };

  const summary: BypassDetectionSummary = {
    total_depts_checked: 0,
    flagged: [],
  };

  for (const conn of (connections ?? []) as ConnRow[]) {
    const [{ count: inbCount }, { count: outCount }] = await Promise.all([
      supabase
        .from('wa_personal_message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('connection_id', conn.id)
        .eq('direction', 'inbound')
        .gte('sent_at', cutoff7d),
      supabase
        .from('wa_personal_message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('connection_id', conn.id)
        .eq('direction', 'outbound')
        .gte('sent_at', cutoff7d),
    ]);

    const inbound = inbCount ?? 0;
    const outbound = outCount ?? 0;

    // Skip depts with too little outbound to make the ratio statistically
    // meaningful — a dept that sent 1 outbound and got 0 inbound isn't a
    // bypass signal.
    if (outbound < MIN_OUTBOUND_FOR_FLAG) continue;

    summary.total_depts_checked++;
    const ratio = inbound / outbound;

    if (ratio < BYPASS_RATIO_THRESHOLD) {
      summary.flagged.push({
        connection_id: conn.id,
        department_id: conn.department_id,
        department_name: conn.departments?.department_name ?? null,
        inbound_7d: inbound,
        outbound_7d: outbound,
        ratio: Number(ratio.toFixed(3)),
      });
    }
  }

  return summary;
}
