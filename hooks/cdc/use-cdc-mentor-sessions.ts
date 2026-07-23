// hooks/cdc/use-cdc-mentor-sessions.ts — mentor session mapping (BUG-004198).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  IndustryMentorPairing, MentorSession, PairingRollup, LogSessionPayload, MentorPairingKind,
} from '@/types/cdc/mentor-sessions';

// ── Industry mentor → learner assignment (fixed list) ──────────────────────
export function useIndustryMentees(mentorId: string) {
  return useQuery({
    queryKey: ['cdc-industry-mentees', mentorId],
    enabled: !!mentorId,
    queryFn: async (): Promise<IndustryMentorPairing[]> => {
      const res = await fetch(`/api/cdc/industry-mentors/${mentorId}/mentees`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      return (await res.json()).pairings as IndustryMentorPairing[];
    },
  });
}

export function useAssignIndustryMentee(mentorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (learnerId: string) => {
      const res = await fetch(`/api/cdc/industry-mentors/${mentorId}/mentees`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learner_id: learnerId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => { toast.success('Learner assigned'); qc.invalidateQueries({ queryKey: ['cdc-industry-mentees', mentorId] }); },
    onError: (e: Error) => toast.error(e.message || 'Could not assign'),
  });
}

export function useUnassignIndustryMentee(mentorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pairingId: string) => {
      const res = await fetch(`/api/cdc/industry-mentors/${mentorId}/mentees?pairing_id=${pairingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      return res.json();
    },
    onSuccess: () => { toast.success('Learner unassigned'); qc.invalidateQueries({ queryKey: ['cdc-industry-mentees', mentorId] }); },
    onError: (e: Error) => toast.error(e.message || 'Could not unassign'),
  });
}

// ── Unified session log (peer + industry) ──────────────────────────────────
export function useMentorSessions(kind: MentorPairingKind, pairingId: string) {
  return useQuery({
    queryKey: ['cdc-mentor-sessions', kind, pairingId],
    enabled: !!pairingId,
    queryFn: async (): Promise<{ sessions: MentorSession[]; rollup: PairingRollup | null }> => {
      const res = await fetch(`/api/cdc/mentor-sessions?kind=${kind}&pairing_id=${pairingId}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      return res.json();
    },
  });
}

export function useLogMentorSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LogSessionPayload) => {
      const res = await fetch('/api/cdc/mentor-sessions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Failed (${res.status})`);
      return res.json();
    },
    onSuccess: (_d, payload) => {
      toast.success('Session logged');
      qc.invalidateQueries({ queryKey: ['cdc-mentor-sessions', payload.kind, payload.pairing_id] });
      qc.invalidateQueries({ queryKey: ['cdc-industry-mentees'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not log session'),
  });
}
