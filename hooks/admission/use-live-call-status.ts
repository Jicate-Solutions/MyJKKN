// hooks/admission/use-live-call-status.ts
// Real-time call status updates via Supabase Realtime subscription.
// Falls back to polling if Realtime is unavailable.

'use client';

import { useEffect, useState, useRef } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CallStatus } from '@/lib/services/telephony/telephony-service';

interface LiveCallState {
  status: CallStatus | null;
  duration: number;
  recordingUrl: string | null;
  isActive: boolean;
  isRinging: boolean;
  isConnected: boolean;
  isTerminal: boolean;
}

const TERMINAL_STATUSES: CallStatus[] = ['completed', 'busy', 'no-answer', 'failed', 'cancelled'];

export function useLiveCallStatus(callLogId: string | null): LiveCallState {
  const [status, setStatus] = useState<CallStatus | null>(null);
  const [duration, setDuration] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [realtimeActive, setRealtimeActive] = useState(true);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Supabase Realtime subscription
  useEffect(() => {
    if (!callLogId) return;

    const supabase = createClientSupabaseClient();
    const channel = supabase
      .channel(`call-status-${callLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'admission_call_logs',
          filter: `id=eq.${callLogId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, any>;
          setStatus(newData.status as CallStatus);
          setDuration(newData.duration_seconds || 0);
          setRecordingUrl(newData.recording_url || null);
        }
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus !== 'SUBSCRIBED') {
          setRealtimeActive(false);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [callLogId]);

  // Polling fallback (every 3 seconds) if Realtime is not available
  useEffect(() => {
    if (!callLogId || realtimeActive) return;
    if (status && TERMINAL_STATUSES.includes(status)) return;

    const poll = async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data } = await supabase
          .from('admission_call_logs')
          .select('status, duration_seconds, recording_url')
          .eq('id', callLogId)
          .single();

        if (data) {
          setStatus(data.status as CallStatus);
          setDuration(data.duration_seconds || 0);
          setRecordingUrl(data.recording_url || null);
        }
      } catch {
        // Silently fail polling
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    poll(); // Initial fetch

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [callLogId, realtimeActive, status]);

  const isTerminal = status ? TERMINAL_STATUSES.includes(status) : false;

  return {
    status,
    duration,
    recordingUrl,
    isActive: !!status && !isTerminal,
    isRinging: status === 'ringing' || status === 'initiated',
    isConnected: status === 'in-progress',
    isTerminal,
  };
}
