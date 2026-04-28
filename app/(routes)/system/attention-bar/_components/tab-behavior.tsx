'use client';

/**
 * Tab 4 — Layer 3 Behavior
 *
 * Aggregate-only stats for Layer 3 behavioral learning. Ships in Phase 5.
 * This stub satisfies the import in attention-bar-admin-client.tsx.
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 Tab 4
 * Permission: attention_bar.audit.view
 * DPDPA note: per-user tap data is NEVER shown to admins — aggregate only.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Brain } from 'lucide-react';

export function TabBehavior() {
  return (
    <div className='space-y-4 py-4'>
      <Card>
        <CardContent className='py-12 flex flex-col items-center gap-3 text-center'>
          <Brain className='h-10 w-10 text-muted-foreground' />
          <p className='font-medium text-muted-foreground'>
            Layer 3 — Behavioral Learning
          </p>
          <p className='text-sm text-muted-foreground max-w-sm'>
            Aggregate consent stats and confidence-score distribution ship in
            Phase 5 after DPDPA legal review. Per-user tap data is never
            visible to admins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
