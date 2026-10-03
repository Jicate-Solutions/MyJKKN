'use client';

import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { TriageReasonChip } from '@/components/instasolver/badges';
import { TRIAGE_REASON_META } from '@/lib/instasolver/constants';
import type { TriageReason } from '@/types/instasolver';

const ORDER: TriageReason[] = ['critical', 'disputed', 'urgent', 'reopened', 'recurring', 'ageing', 'unassigned'];

/** How the score is built. Weights come from TRIAGE_REASON_META, not from here. */
export function TriageLegend() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">
            The queue is ranked by the database, highest score first. The score adds the reported severity and the
            priority you set to the points below. Every reason that applied to a row is shown on it.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm">
              <span className="shrink-0">
                <TriageReasonChip reason={reason} />
              </span>
              <span className="min-w-0 text-muted-foreground">
                <span className="font-medium text-foreground">{TRIAGE_REASON_META[reason].weight}</span> —{' '}
                {TRIAGE_REASON_META[reason].description}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
