export const dynamic = 'force-dynamic';

// /api/whatsapp-personal/connection-health
// Spec 3 H2.1: Returns per-connection health summary for the global header badge
// + Senior Learner dashboard card (H2.2). RLS enforced — caller sees only
// connections their role/dept allows (super_admin sees all, HoD sees own dept).
//
// Response shape (consumed by hooks/use-byow-connection-health.ts):
//   { connections: [{id, department_id, department_name, status,
//                     phone_number, last_inbound_at, last_outbound_at,
//                     hours_since_last_inbound}],
//     summary: { ready, stale, disconnected, total } }

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getPolicyInt } from '@/lib/policies/get-policy';
import { POLICY_KEYS } from '@/lib/policies/keys';

export async function GET() {
  const supabase = await createClient();

  // Auth gate — must have an authenticated user (RLS does the role/dept filtering).
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const staleThresholdHours = await getPolicyInt(
    POLICY_KEYS.WA_BYOW_CONNECTION_STALE_THRESHOLD_HOURS,
    24
  );
  const forceDisconnectHours = await getPolicyInt(
    POLICY_KEYS.WA_BYOW_CONNECTION_FORCE_DISCONNECT_AFTER_HOURS,
    72
  );

  // RLS auto-filters this query — caller sees only connections in their scope.
  const { data: rows, error } = await supabase
    .from('wa_byow_connection_health')
    .select(`
      connection_id,
      last_inbound_at,
      last_outbound_at,
      stale_detected_at,
      last_pulse_status,
      wa_personal_connections!inner (
        id,
        department_id,
        status,
        phone_number,
        departments:department_id ( department_name )
      )
    `)
    .order('connection_id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type ConnectionInfo = {
    id: string;
    department_id: string;
    status: string;
    phone_number: string | null;
    departments: { department_name: string } | null;
  };

  type HealthRow = {
    connection_id: string;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
    stale_detected_at: string | null;
    last_pulse_status: string;
    wa_personal_connections: ConnectionInfo;
  };

  const now = Date.now();
  const summary = { ready: 0, stale: 0, disconnected: 0, total: 0 };

  const connections = (rows as HealthRow[] | null ?? []).map((r) => {
    const conn = r.wa_personal_connections;
    const lastInb = r.last_inbound_at ? new Date(r.last_inbound_at).getTime() : null;
    const lastOut = r.last_outbound_at ? new Date(r.last_outbound_at).getTime() : null;
    const lastActivity = Math.max(lastInb ?? 0, lastOut ?? 0);
    const hoursSinceLastInbound =
      lastInb === null ? null : (now - lastInb) / 3_600_000;
    const hoursSinceLastActivity = lastActivity === 0 ? Infinity : (now - lastActivity) / 3_600_000;

    // Effective status: connection.status PLUS our staleness assessment.
    let effective: 'ready' | 'stale' | 'disconnected';
    if (conn.status === 'disconnected') effective = 'disconnected';
    else if (r.stale_detected_at !== null || hoursSinceLastActivity > staleThresholdHours)
      effective = 'stale';
    else effective = 'ready';

    summary[effective]++;
    summary.total++;

    return {
      id: conn.id,
      department_id: conn.department_id,
      department_name: conn.departments?.department_name ?? null,
      status: effective,
      phone_number: conn.phone_number,
      last_inbound_at: r.last_inbound_at,
      last_outbound_at: r.last_outbound_at,
      hours_since_last_inbound: hoursSinceLastInbound,
      hours_remaining_before_force_disconnect:
        effective === 'stale'
          ? Math.max(0, forceDisconnectHours - hoursSinceLastActivity)
          : null,
    };
  });

  return NextResponse.json({
    connections,
    summary,
    thresholds: {
      stale_after_hours: staleThresholdHours,
      force_disconnect_after_hours: forceDisconnectHours,
    },
  });
}
