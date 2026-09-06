// hooks/events/shared/use-event-ops.ts
// React Query hooks for shared event-day operations — check-in + QR passes (Events Platform Promotion PR5).
// Works for any event type via EventOpsService. The marathon ops pages keep their own
// hooks/events/marathon/use-marathon-ops.ts (with Realtime); these power the shared logistics boards.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventOpsService } from '@/lib/services/events/shared/event-ops-service';

const KEYS = {
  all: ['event-ops'] as const,
  stats: (eventId: string) => [...KEYS.all, 'stats', eventId] as const,
  checkinList: (eventId: string) => [...KEYS.all, 'checkin-list', eventId] as const,
  qrList: (eventId: string) => [...KEYS.all, 'qr-list', eventId] as const,
};

// ── Check-in ────────────────────────────────────────────────────────────────

/** All registrations for an event with check-in state, ordered by BIB. */
export function useEventCheckinList(eventId: string) {
  return useQuery({
    queryKey: KEYS.checkinList(eventId),
    queryFn: async () => {
      const supabase = (await import('@/lib/supabase/client')).createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events_registrations')
        .select(`
          id, bib_number, participant_name, participant_email, participant_phone,
          checked_in, checked_in_at,
          category:event_categories(name, code),
          stall:events_stalls(stall_name, stall_code)
        `)
        .eq('event_id', eventId)
        .order('bib_number', { ascending: true });
      return data ?? [];
    },
    enabled: !!eventId,
    refetchInterval: 30_000,
  });
}

/** Live ops stats (check-in counts + per-stall breakdown). */
export function useEventOpsStats(eventId: string) {
  return useQuery({
    queryKey: KEYS.stats(eventId),
    queryFn: () => EventOpsService.getOpsStats(eventId),
    enabled: !!eventId,
    refetchInterval: 30_000,
  });
}

/** Toggle a registration's check-in directly by id (no BIB scan). */
export function useSetCheckedIn(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      checkedIn,
      operatorId,
    }: {
      registrationId: string;
      checkedIn: boolean;
      operatorId: string;
    }) => EventOpsService.setCheckedIn(registrationId, checkedIn, operatorId),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.checkinList(eventId) });
      qc.invalidateQueries({ queryKey: KEYS.stats(eventId) });
      toast.success(vars.checkedIn ? 'Checked in' : 'Check-in undone');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update check-in'),
  });
}

// ── QR passes ─────────────────────────────────────────────────────────────--

/** Registrations with BIB numbers + their QR generation state. */
export function useEventQrRegistrations(eventId: string) {
  return useQuery({
    queryKey: KEYS.qrList(eventId),
    queryFn: () => EventOpsService.getQrRegistrations(eventId),
    enabled: !!eventId,
  });
}

/** Generate QR passes for the event (or specific BIBs). `force` regenerates existing. */
export function useGenerateQrPasses(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { force?: boolean; bibNumbers?: string[] } = {}) =>
      EventOpsService.generateQrPasses(eventId, opts),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: KEYS.qrList(eventId) });
      const generated = result?.generated ?? 0;
      const failed = result?.failed ?? 0;
      if (failed > 0) {
        toast(`Generated ${generated} passes, ${failed} failed`, { icon: '⚠️' });
      } else if (generated > 0) {
        toast.success(`Generated ${generated} QR pass${generated === 1 ? '' : 'es'}`);
      } else {
        toast('No new passes to generate', { icon: 'ℹ️' });
      }
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to generate QR passes'),
  });
}
