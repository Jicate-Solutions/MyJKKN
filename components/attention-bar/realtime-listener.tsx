'use client';

/**
 * RealtimeListener — Layer 0 Supabase Realtime glue + queue-depth overlay.
 *
 * Spec: specs/attention-bar-5-layer-system.md §3 Layer 0.
 *
 * This is a client-only sibling of <AttentionBar/> with two responsibilities:
 *
 *   1. Subscribe to user_notifications INSERTs via useAttentionBarRealtime.
 *      On every fire, invalidate the React Query cache for the attention bar
 *      so the resolver re-runs and Layer 0 gets a chance to fire ahead of
 *      Layer 1/2/3/4.
 *
 *   2. Render a tiny "+N" pip overlay on top of the bar when queueDepth > 1
 *      (a second urgent arrived while the first was still showing). Spec §3:
 *      "small +N pip if queue > 0".
 *
 * Why a separate component:
 *   - <AttentionBar/> is a render-only consumer of useAttentionBar (TanStack
 *     Query). Plumbing the realtime listener into it would couple two
 *     concerns and make the component impossible to render in test/sandbox
 *     contexts that don't have a logged-in user.
 *   - Phase 4 admin-UI Test Sandbox renders <AttentionBar/> in isolation
 *     to preview rule outputs; it should NOT open a realtime channel.
 *   - Splitting also means future agents can replace the realtime layer
 *     (e.g. swap to server-sent events) without touching the bar's render.
 *
 * Positioning of the pip:
 *   - Same anchor math as <AttentionBar/> (bottom = safe-area + 64px nav
 *     + 8px gutter), shifted right by 12px and up by 8px so it sits at the
 *     top-right corner of where the bar pill renders.
 *   - Hidden on lg+ (desktop has the sidebar; bar+pip are mobile-only).
 *
 * Failure mode: if the Realtime channel never connects (network error,
 * Supabase outage), nothing breaks — the bar still polls via TanStack
 * Query's refetchOnWindowFocus + the 30s staleTime. We're enhancing the
 * 30s polling baseline with a sub-second fire on real-time events.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAttentionBarRealtime } from '@/hooks/use-attention-bar-realtime';

interface RealtimeListenerProps {
  /**
   * Optional debug flag — when true, renders a 4×4px live-status dot in
   * the bottom-right corner indicating channel connection state. OFF by
   * default; super-admins can flip it on via a query param if we ever
   * need to verify the channel from a real device.
   */
  showLiveDot?: boolean;
}

export function RealtimeListener({ showLiveDot = false }: RealtimeListenerProps) {
  const queryClient = useQueryClient();

  // On every urgent insert, invalidate the resolver query so <AttentionBar/>
  // refetches and the resolver gets a chance to surface Layer 0 ahead of
  // whatever Layer 1/2 was previously rendering.
  const onUrgent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['attention-bar'] });
  }, [queryClient]);

  const { isConnected, queueDepth } = useAttentionBarRealtime({ onUrgent });

  // Phase 3 v1: only render the +N pip when more than one urgent is queued.
  // (Spec §3: "small +N pip if queue > 0" — interpretation: show '+N' when
  // there's a backlog beyond the one currently displayed.)
  const showPip = queueDepth > 1;

  return (
    <>
      {showPip && (
        <div
          data-attention-bar-pip
          aria-hidden="true"
          className="pointer-events-none fixed z-[76] flex items-center justify-center rounded-full bg-red-600 text-white shadow-lg ring-2 ring-white lg:hidden"
          style={{
            // Anchor at top-right of the bar pill: bar bottom is
            // safe-area + 64px nav + 8px gutter; bar height ~52px (min-h
            // 48 + py-2). We want the pip to overlap the top-right corner.
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px + 8px + 36px)',
            right: '8px',
            minWidth: '20px',
            height: '20px',
            padding: '0 6px',
            fontSize: '11px',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          +{Math.min(queueDepth - 1, 99)}
        </div>
      )}

      {showLiveDot && (
        <div
          data-attention-bar-live-dot
          aria-hidden="true"
          className="pointer-events-none fixed bottom-2 right-2 z-[77] h-1.5 w-1.5 rounded-full lg:hidden"
          style={{
            backgroundColor: isConnected ? '#22c55e' : '#ef4444',
            boxShadow: isConnected
              ? '0 0 4px rgba(34, 197, 94, 0.8)'
              : '0 0 4px rgba(239, 68, 68, 0.5)',
          }}
        />
      )}
    </>
  );
}
