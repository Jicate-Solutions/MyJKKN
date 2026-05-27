import { useEffect, useRef, useCallback, useState } from 'react';
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

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

export function useAuditLogSubscription() {
  const queryClient = useQueryClient();
  const subscriptionRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  const getRetryDelay = useCallback((retryCount: number) => {
    return INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
  }, []);

  const unsubscribe = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const subscribe = useCallback(() => {
    if (subscriptionRef.current) return;
    if (!isMountedRef.current) return;

    try {
      setStatus('connecting');
      const supabase = createClientSupabaseClient();

      const channel = supabase
        .channel('school_defaults_audit_logs', {
          config: { broadcast: { self: false } },
        })
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'school_defaults_audit_logs',
          },
          (payload) => {
            const newLog = payload.new as AuditLogEntry;
            queryClient.invalidateQueries({
              queryKey: ['audit-logs'],
            });
          }
        )
        .subscribe((status, err) => {
          if (!isMountedRef.current) return;

          if (status === 'SUBSCRIBED') {
            setStatus('connected');
            retryCountRef.current = 0;
          } else if (status === 'CHANNEL_ERROR') {
            setStatus('error');
            handleSubscriptionError(err);
          } else if (status === 'CLOSED') {
            setStatus('disconnected');
            scheduleReconnect();
          }
        });

      subscriptionRef.current = channel;
    } catch (err) {
      if (isMountedRef.current) {
        setStatus('error');
        handleSubscriptionError(err);
      }
    }
  }, [queryClient]);

  const handleSubscriptionError = useCallback((error: any) => {
    console.error('Audit log subscription error:', error);
    scheduleReconnect();
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;

    if (retryCountRef.current >= MAX_RETRIES) {
      setStatus('error');
      return;
    }

    const delay = getRetryDelay(retryCountRef.current);
    retryCountRef.current += 1;

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    retryTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        unsubscribe();
        subscribe();
      }
    }, delay);
  }, [getRetryDelay, subscribe, unsubscribe]);

  useEffect(() => {
    isMountedRef.current = true;
    subscribe();

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [subscribe, unsubscribe]);

  return {
    isConnected: status === 'connected',
    status,
    subscribe,
    unsubscribe,
  };
}
