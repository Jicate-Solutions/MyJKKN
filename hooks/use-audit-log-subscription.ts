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

interface SubscriptionState {
  status: ConnectionStatus;
  lastHeartbeat: number;
  missedHeartbeats: number;
}

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
const HEARTBEAT_INTERVAL = 30000;
const HEARTBEAT_TIMEOUT = 10000;

export function useAuditLogSubscription() {
  const queryClient = useQueryClient();
  const subscriptionRef = useRef<any>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const [subscriptionState, setSubscriptionState] = useState<SubscriptionState>({
    status: 'connecting',
    lastHeartbeat: Date.now(),
    missedHeartbeats: 0,
  });

  const getRetryDelay = useCallback((retryCount: number) => {
    return INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  const sendHeartbeat = useCallback(() => {
    if (!isMountedRef.current || subscriptionRef.current === null) return;

    try {
      subscriptionRef.current.send({
        type: 'heartbeat',
        timestamp: Date.now(),
      });

      heartbeatTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;

        setSubscriptionState(prev => ({
          ...prev,
          missedHeartbeats: prev.missedHeartbeats + 1,
        }));

        if (subscriptionState.missedHeartbeats > 2) {
          scheduleReconnect();
        }
      }, HEARTBEAT_TIMEOUT);
    } catch (err) {
      console.error('Heartbeat send failed:', err);
    }
  }, [subscriptionState.missedHeartbeats]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);

    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL);
  }, [sendHeartbeat]);

  const unsubscribe = useCallback(() => {
    stopHeartbeat();
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, [stopHeartbeat]);

  const subscribe = useCallback(() => {
    if (subscriptionRef.current) return;
    if (!isMountedRef.current) return;

    try {
      setSubscriptionState(prev => ({
        ...prev,
        status: 'connecting',
      }));
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
            setSubscriptionState(prev => ({
              ...prev,
              status: 'connected',
              lastHeartbeat: Date.now(),
              missedHeartbeats: 0,
            }));
            retryCountRef.current = 0;
            startHeartbeat();
          } else if (status === 'CHANNEL_ERROR') {
            setSubscriptionState(prev => ({
              ...prev,
              status: 'error',
            }));
            stopHeartbeat();
            handleSubscriptionError(err);
          } else if (status === 'CLOSED') {
            setSubscriptionState(prev => ({
              ...prev,
              status: 'disconnected',
            }));
            stopHeartbeat();
            scheduleReconnect();
          }
        });

      subscriptionRef.current = channel;
    } catch (err) {
      if (isMountedRef.current) {
        setSubscriptionState(prev => ({
          ...prev,
          status: 'error',
        }));
        handleSubscriptionError(err);
      }
    }
  }, [queryClient, startHeartbeat, stopHeartbeat]);

  const handleSubscriptionError = useCallback((error: any) => {
    console.error('Audit log subscription error:', error);
    scheduleReconnect();
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!isMountedRef.current) return;

    if (retryCountRef.current >= MAX_RETRIES) {
      setSubscriptionState(prev => ({
        ...prev,
        status: 'error',
      }));
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
      stopHeartbeat();
      unsubscribe();
    };
  }, [subscribe, unsubscribe, stopHeartbeat]);

  return {
    isConnected: subscriptionState.status === 'connected',
    status: subscriptionState.status,
    lastHeartbeat: subscriptionState.lastHeartbeat,
    missedHeartbeats: subscriptionState.missedHeartbeats,
    subscribe,
    unsubscribe,
  };
}
