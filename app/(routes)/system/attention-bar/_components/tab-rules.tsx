'use client';

/**
 * Tab 3 — Layer 2 Rules (placeholder)
 *
 * Wave 2 shipped Tab 1 only; Tabs 2/3/5/7 are pending future PRs.
 * This stub satisfies the import in attention-bar-admin-client.tsx so the
 * page compiles and the tab pill renders a friendly "coming soon" panel
 * for users with attention_bar.rules.manage.
 */

import { Card, CardContent } from '@/components/ui/card';
import { ListChecks } from 'lucide-react';

export function TabRules() {
  return (
    <Card className='py-12'>
      <CardContent className='flex flex-col items-center justify-center gap-3 text-center'>
        <ListChecks className='h-10 w-10 text-muted-foreground' />
        <h3 className='text-base font-semibold'>Layer 2 — Rules</h3>
        <p className='text-sm text-muted-foreground max-w-md'>
          Rule CRUD UI is being built in a follow-on Wave 4 PR.
          The CRUD API endpoints are already live at
          /api/attention-bar/admin/rules.
        </p>
      </CardContent>
    </Card>
  );
}
