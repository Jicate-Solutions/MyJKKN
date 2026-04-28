'use client';

/**
 * Tab 7 — Test Sandbox (placeholder)
 *
 * Wave 2 shipped Tab 1 only; Tabs 2/3/5/7 are pending future PRs.
 * This stub satisfies the import in attention-bar-admin-client.tsx so the
 * page compiles and the tab pill renders a friendly "coming soon" panel
 * for users with attention_bar.test_sandbox.use.
 */

import { Card, CardContent } from '@/components/ui/card';
import { TestTube } from 'lucide-react';

export function TabSandbox() {
  return (
    <Card className='py-12'>
      <CardContent className='flex flex-col items-center justify-center gap-3 text-center'>
        <TestTube className='h-10 w-10 text-muted-foreground' />
        <h3 className='text-base font-semibold'>Test Sandbox</h3>
        <p className='text-sm text-muted-foreground max-w-md'>
          Sandbox harness for previewing rule firings without writing audit
          rows is being built in a follow-on Wave 4 PR.
          See specs/attention-bar-5-layer-system.md §6 tab 7.
        </p>
      </CardContent>
    </Card>
  );
}
