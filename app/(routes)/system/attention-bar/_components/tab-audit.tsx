'use client';

/**
 * Tab 6 — Audit Log
 *
 * Filterable table of quick_action_audit rows. Ships in Phase 4.
 * This stub satisfies the import in attention-bar-admin-client.tsx.
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 Tab 6
 * Permission: attention_bar.audit.view
 */

import { Card, CardContent } from '@/components/ui/card';
import { ClipboardList } from 'lucide-react';

export function TabAudit() {
  return (
    <div className='space-y-4 py-4'>
      <Card>
        <CardContent className='py-12 flex flex-col items-center gap-3 text-center'>
          <ClipboardList className='h-10 w-10 text-muted-foreground' />
          <p className='font-medium text-muted-foreground'>
            Audit Log
          </p>
          <p className='text-sm text-muted-foreground max-w-sm'>
            Filterable table of resolve audit rows (date, user, page,
            fired_layer) ships in Phase 4 alongside the rules engine.
            Every render already writes to the audit table.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
