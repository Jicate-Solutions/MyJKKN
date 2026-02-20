'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useOverdueProspects } from '@/hooks/solutions/use-overdue-prospects';
import { differenceInDays } from 'date-fns';

export function OverdueAlertBanner() {
  const [dismissed, setDismissed] = useState(false);
  const { data } = useOverdueProspects();

  const overdueProspects = data?.data ?? [];
  const count = overdueProspects.length;

  if (dismissed || count === 0) return null;

  const today = new Date();
  const top3 = overdueProspects.slice(0, 3).map((p) => {
    const daysOverdue = p.next_action_date
      ? differenceInDays(today, new Date(p.next_action_date))
      : 0;
    return { id: p.id, company: p.company_name, daysOverdue };
  });

  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 [&>svg]:text-amber-600">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center justify-between">
        <span>
          {count} follow-up{count !== 1 ? 's' : ''} overdue
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 -mr-2 -mt-1 text-amber-600 hover:text-amber-800 hover:bg-amber-100"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </AlertTitle>
      <AlertDescription className="space-y-2">
        <ul className="text-sm space-y-1">
          {top3.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="font-medium">{p.company}</span>
              <span className="text-amber-700 dark:text-amber-400">
                ({p.daysOverdue} day{p.daysOverdue !== 1 ? 's' : ''} overdue)
              </span>
            </li>
          ))}
        </ul>
        {count > 3 && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            ...and {count - 3} more
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          asChild
          className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200"
        >
          <Link href="/solutions/pipeline/list?overdue=true">
            View All Overdue
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
