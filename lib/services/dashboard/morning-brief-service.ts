/**
 * Dashboard v2 — Morning Brief service
 * Calls fn_dashboard_morning_brief() RPC. IST-aware.
 *
 * Spec: specs/myjkkn-dashboard-v2-spec.md §7.7
 */

import { createClient } from '@/lib/supabase/server';

export type MorningPriority = {
  notification_id: string;
  user_notification_id: string;
  title: string;
  queue_type: 'approval' | 'escalation' | 'rescue' | 'anomaly' | 'other';
  priority: 'urgent' | 'high' | 'normal' | null;
  age_seconds: number;
};

export type MorningBrief = {
  ok: boolean;
  greeting: string;
  name: string;
  date_ist: string;
  yesterday: {
    closed: number;
    auto_escalated: number;
    rescues_claimed: number;
  };
  today: {
    pending_urgent: number;
    pending_high: number;
    cold_leads: number;
    carried_over: number;
  };
  top_priorities: MorningPriority[];
};

const EMPTY_BRIEF: MorningBrief = {
  ok: false,
  greeting: 'Hello',
  name: 'Director',
  date_ist: new Date().toISOString().slice(0, 10),
  yesterday: { closed: 0, auto_escalated: 0, rescues_claimed: 0 },
  today: { pending_urgent: 0, pending_high: 0, cold_leads: 0, carried_over: 0 },
  top_priorities: []
};

export async function getMorningBrief(): Promise<MorningBrief> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('fn_dashboard_morning_brief');
    if (error) {
      console.error('[dashboard/morning-brief] rpc error:', error);
      return EMPTY_BRIEF;
    }
    return (data as MorningBrief) ?? EMPTY_BRIEF;
  } catch (err) {
    console.error('[dashboard/morning-brief] unexpected error:', err);
    return EMPTY_BRIEF;
  }
}
