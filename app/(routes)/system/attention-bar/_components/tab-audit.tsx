'use client';

/**
 * Tab 6 - Audit log (placeholder stub).
 *
 * Wave 4 implementation: paginated table over quick_action_audit with
 * filters (user, page, layer, time range) and trace expansion.
 *
 * This stub exists so attention-bar-admin-client.tsx compiles after Wave 3
 * which only ships Tabs 3 and 5.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

export function TabAudit() {
  return (
    <div className='space-y-6 py-4'>
      <h3 className='text-lg font-semibold flex items-center gap-2'>
        <ClipboardList className='h-5 w-5 text-slate-500' />
        Audit Log
      </h3>
      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Coming in Wave 4</CardTitle>
        </CardHeader>
        <CardContent>
          <p className='text-sm text-muted-foreground'>
            This tab will show the paginated{' '}
            <code>quick_action_audit</code> table with filters per user, page,
            layer, and time range. Backend route already exists at
            <code className='ml-1'>/api/attention-bar/admin/audit</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
