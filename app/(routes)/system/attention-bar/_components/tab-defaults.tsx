'use client';

/**
 * Tab 2 - Layer 1 Defaults (placeholder stub).
 *
 * Wave 4 implementation: coverage matrix of static defaults from
 * lib/attention-bar/static-defaults.ts with gap detection per page x role.
 *
 * This stub exists so attention-bar-admin-client.tsx compiles after Wave 3
 * which only ships Tabs 3 and 5. Replace the body with the real component
 * when Wave 4 lands.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Layers } from 'lucide-react';

export function TabDefaults() {
  return (
    <div className='space-y-6 py-4'>
      <h3 className='text-lg font-semibold flex items-center gap-2'>
        <Layers className='h-5 w-5 text-blue-500' />
        Layer 1 — Defaults
      </h3>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Coming in Wave 4</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            This tab will show the coverage matrix of static defaults
            (page × role) loaded from{' '}
            <code>lib/attention-bar/static-defaults.ts</code>, plus gaps where
            no default exists. Use the CI gate
            <code className='ml-1'>scripts/check-attention-bar-coverage.ts</code>
            until then.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
