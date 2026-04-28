'use client';

/**
 * Tab 3 — Layer 2 Rules
 *
 * CRUD on quick_action_rules. Phase 4 — ships in wave-3 follow-on.
 * This stub satisfies the import in attention-bar-admin-client.tsx.
 *
 * Spec: specs/attention-bar-5-layer-system.md §6 Tab 3
 * Permission: attention_bar.rules.manage
 */

import { Card, CardContent } from '@/components/ui/card';
import { Settings2 } from 'lucide-react';

export function TabRules() {
  return (
    <div className='space-y-4 py-4'>
      <Card>
        <CardContent className='py-12 flex flex-col items-center gap-3 text-center'>
          <Settings2 className='h-10 w-10 text-muted-foreground' />
          <p className='font-medium text-muted-foreground'>
            Layer 2 — Rules Engine
          </p>
          <p className='text-sm text-muted-foreground max-w-sm'>
            Rule CRUD editor ships in a follow-on phase. State-aware rules are
            evaluated at resolve time — see the Test Sandbox (Tab 7) to verify
            resolution.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
