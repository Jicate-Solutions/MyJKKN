'use client';

/**
 * Tab 5 — Layer 4 AI (placeholder)
 *
 * Wave 2 shipped Tab 1 only; Tabs 2/3/5/7 are pending future PRs.
 * This stub satisfies the import in attention-bar-admin-client.tsx so the
 * page compiles and the tab pill renders a friendly "coming soon" panel
 * for users with attention_bar.config.manage.
 *
 * Accepts isSuperAdmin for parity with the eventual real implementation
 * (kill-switch + budget edits gated to super-admin only).
 */

import { Card, CardContent } from '@/components/ui/card';
import { Brain } from 'lucide-react';

interface TabAiProps {
  isSuperAdmin: boolean;
}

export function TabAi(_props: TabAiProps) {
  return (
    <Card className='py-12'>
      <CardContent className='flex flex-col items-center justify-center gap-3 text-center'>
        <Brain className='h-10 w-10 text-muted-foreground' />
        <h3 className='text-base font-semibold'>Layer 4 — AI</h3>
        <p className='text-sm text-muted-foreground max-w-md'>
          AI config + kill-switch UI is being built in a follow-on Wave 4 PR.
          The kill-switch API is already live at
          /api/attention-bar/admin/config.
        </p>
      </CardContent>
    </Card>
  );
}
