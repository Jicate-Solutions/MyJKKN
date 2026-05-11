'use client';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FeeChangeEventService } from '@/lib/services/admission/fee-change-event-service';
import { EventsPanel } from './events-panel';

interface Props { institutionId?: string; }

export function FeeChangeEventNotificationBell({ institutionId }: Props) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = async () => {
      try {
        const events = await FeeChangeEventService.listPending(institutionId);
        setCount(events.length);
      } catch { /* ignore — toast spam not desired here */ }
    };
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [institutionId]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="relative">
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </Button>
      <EventsPanel open={open} onOpenChange={setOpen} institutionId={institutionId} />
    </>
  );
}
