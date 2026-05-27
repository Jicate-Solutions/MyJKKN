import { useEffect, useRef, useCallback } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface AuditLogEntry {
  id: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  school_id: string;
  school_name: string;
  resource_type: 'degree' | 'department';
  changes: Record<string, any>;
  user_id: string;
  created_at: string;
}

export function useAuditLogSubscription() {
  const queryClient = useQueryClient();
  const subscriptionRef = useRef<any>(null);
  const connectedRef = useRef(false);

  const subscribe = useCallback(() => {
    if (connectedRef.current) return;

    const supabase = createClientSupabaseClient();

    const channel = supabase
      .channel('school_defaults_audit_logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'school_defaults_audit_logs',
        },
        (payload) => {
          const newLog = payload.new as AuditLogEntry;
          // Invalidate audit logs query to refetch
          queryClient.invalidateQueries({
            queryKey: ['audit-logs']
          });
        }
      )
      .subscribe((status) => {
        connectedRef.current = status === 'SUBSCRIBED';
      });

    subscriptionRef.current = channel;
  }, [queryClient]);

  const unsubscribe = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      connectedRef.current = false;
      subscriptionRef.current = null;
    }
  }, []);

  useEffect(() => {
    subscribe();
    return () => unsubscribe();
  }, [subscribe, unsubscribe]);

  return {
    isConnected: connectedRef.current,
    subscribe,
    unsubscribe,
  };
}
