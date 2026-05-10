// hooks/admission/use-voice-memo-monitor.ts
// React Query hook for the voice memo monitor snapshot.
// Polls /api/admission/voice-memo-monitor/snapshot at the interval
// supplied by the snapshot itself (policy.refresh_interval_seconds).
//
// Created 2026-05-10 (voice-memo-monitor substrate, Phase 2).

'use client';

import { useQuery } from '@tanstack/react-query';
import type { VoiceMemoMonitorSnapshot } from '@/types/voice-memo-monitor';

async function fetchSnapshot(): Promise<VoiceMemoMonitorSnapshot> {
  const res = await fetch('/api/admission/voice-memo-monitor/snapshot', {
    credentials: 'include',
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message ?? `Snapshot fetch failed (${res.status})`);
  }
  const json = await res.json();
  return json.data as VoiceMemoMonitorSnapshot;
}

export const voiceMemoMonitorKeys = {
  all: ['admission', 'voice-memo-monitor'] as const,
  snapshot: () => [...voiceMemoMonitorKeys.all, 'snapshot'] as const,
};

export function useVoiceMemoMonitor() {
  return useQuery({
    queryKey: voiceMemoMonitorKeys.snapshot(),
    queryFn: fetchSnapshot,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 30_000;
      const seconds = data.policy.refresh_interval_seconds;
      return seconds > 0 ? seconds * 1000 : false;
    },
    staleTime: 5_000,
  });
}
