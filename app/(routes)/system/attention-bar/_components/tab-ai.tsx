'use client';

/**
 * Tab 5 — Layer 4 AI
 *
 * Cache hit rate, cost dashboard, daily-budget controls, kill-switch.
 * Ships in Phase 6.
 * This stub satisfies the import in attention-bar-admin-client.tsx.
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 Tab 5
 * Permission: attention_bar.config.manage
 */

import { Card, CardContent } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

interface TabAiProps {
  isSuperAdmin: boolean;
}

export function TabAi({ isSuperAdmin: _ }: TabAiProps) {
  return (
    <div className='space-y-4 py-4'>
      <Card>
        <CardContent className='py-12 flex flex-col items-center gap-3 text-center'>
          <Sparkles className='h-10 w-10 text-muted-foreground' />
          <p className='font-medium text-muted-foreground'>
            Layer 4 — AI Fallback
          </p>
          <p className='text-sm text-muted-foreground max-w-sm'>
            Cost dashboard, cache controls, daily-budget cap, and kill-switch
            ship in Phase 6 alongside the LLM integration. Circuit-breaker
            rails are already live (see Phase 6a).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
