'use client';

/**
 * Tab 4 - Layer 3 Behavior (placeholder stub).
 *
 * Wave 4 implementation: per-user tap counters, confidence engine output,
 * consent rate breakdown, and per-rule rolling averages.
 *
 * This stub exists so attention-bar-admin-client.tsx compiles after Wave 3
 * which only ships Tabs 3 and 5.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

export function TabBehavior() {
  return (
    <div className='space-y-6 py-4'>
      <h3 className='text-lg font-semibold flex items-center gap-2'>
        <Sparkles className='h-5 w-5 text-teal-500' />
        Layer 3 — Behavior
      </h3>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Coming in Wave 4</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            This tab will show consent stats, per-user tap counters, and the
            confidence engine&apos;s rolling averages. Backend hooks already
            exist in <code>lib/attention-bar/tap-tracker.ts</code> and{' '}
            <code>lib/attention-bar/confidence-engine.ts</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
