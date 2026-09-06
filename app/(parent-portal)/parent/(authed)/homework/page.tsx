'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpenCheck, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { useParentHomework } from '@/hooks/parent/use-parent-features';
import type { HomeworkStatus } from '@/types/parent-portal';

const STATUS_STYLE: Record<HomeworkStatus, string> = {
  pending: 'bg-neutral-100 text-neutral-600',
  submitted: 'bg-blue-100 text-blue-700',
  marked: 'bg-green-100 text-green-700',
  returned: 'bg-amber-100 text-amber-700',
  late: 'bg-red-100 text-red-700',
};

export default function HomeworkPage() {
  const { data, isLoading } = useParentHomework();
  const items = data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Homework</h1>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <BookOpenCheck className="mx-auto mb-2 h-6 w-6 text-[#0b6d41]" />
          No homework assigned right now.
        </Card>
      ) : (
        items.map((hw) => {
          const status = hw.submission?.status ?? 'pending';
          return (
            <Link key={hw.id} href={`/parent/homework/${hw.id}`}>
              <Card className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  {hw.subject && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#0b6d41]">
                      {hw.subject}
                    </span>
                  )}
                  <p className="truncate font-bold">{hw.title}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {hw.dueDate && (
                      <span className="text-xs text-muted-foreground">Due {formatDate(hw.dueDate)}</span>
                    )}
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize', STATUS_STYLE[status])}>
                      {status}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Card>
            </Link>
          );
        })
      )}
    </div>
  );
}
