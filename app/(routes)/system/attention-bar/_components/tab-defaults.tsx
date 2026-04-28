'use client';

/**
 * Tab 2 — Layer 1 Defaults (placeholder)
 *
 * Wave 2 shipped Tab 1 only; Tabs 2/3/5/7 are pending future PRs.
 * This stub satisfies the import in attention-bar-admin-client.tsx so the
 * page compiles and the tab pill renders a friendly "coming soon" panel
 * for users with attention_bar.rules.view.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Layers } from 'lucide-react';

export function TabDefaults() {
  return (
    <Card className='py-12'>
      <CardContent className='flex flex-col items-center justify-center gap-3 text-center'>
        <Layers className='h-10 w-10 text-muted-foreground' />
        <h3 className='text-base font-semibold'>Layer 1 — Defaults</h3>
        <p className='text-sm text-muted-foreground max-w-md'>
          Default rule editor is being built in a follow-on Wave 4 PR.
          See specs/attention-bar-5-layer-system.md §6 tab 2.
        </p>
      </CardContent>
    </Card>
  );
}
