// hooks/events/use-my-event-registration.ts
// The CURRENT user's registration for one event, or null.
//
// Needs no new RLS policy: events_reg_self_read already grants
// (profile_id = auth.uid()), so this reads with the ordinary browser client.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface MyEventRegistration {
  id: string;
  created_at: string | null;
  participant_phone: string | null;
  custom_fields: Record<string, unknown> | null;
}

export function useMyEventRegistration(eventId: string, profileId?: string | null) {
  return useQuery({
    queryKey: ['my-event-registration', eventId, profileId],
    enabled: !!eventId && !!profileId,
    queryFn: async (): Promise<MyEventRegistration | null> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('events_registrations')
        .select('id, created_at, participant_phone, custom_fields')
        .eq('event_id', eventId)
        .eq('profile_id', profileId)
        .neq('status', 'cancelled')
        .maybeSingle();
      if (error) throw error;
      return (data as MyEventRegistration) ?? null;
    },
  });
}
