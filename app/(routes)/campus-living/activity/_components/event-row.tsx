'use client';

import { Badge } from '@/components/ui/badge';
import {
  CalendarOff,
  DoorOpen,
  ShieldAlert,
  UserCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type {
  CampusLivingActivityEvent,
  CampusLivingEventType,
} from '@/types/campus-living/activity-feed';

const EVENT_META: Record<
  CampusLivingEventType,
  { label: string; icon: LucideIcon; tone: string }
> = {
  attendance: {
    label: 'Attendance',
    icon: UserCheck,
    tone: 'bg-blue-100 text-blue-800',
  },
  leave: {
    label: 'Leave',
    icon: CalendarOff,
    tone: 'bg-amber-100 text-amber-800',
  },
  gate_pass: {
    label: 'Gate Pass',
    icon: DoorOpen,
    tone: 'bg-emerald-100 text-emerald-800',
  },
  maintenance: {
    label: 'Maintenance',
    icon: Wrench,
    tone: 'bg-indigo-100 text-indigo-800',
  },
  incident: {
    label: 'Incident',
    icon: ShieldAlert,
    tone: 'bg-rose-100 text-rose-800',
  },
};

export function ActivityEventRow({
  event,
}: {
  event: CampusLivingActivityEvent;
}) {
  const meta = EVENT_META[event.event_type];
  const Icon = meta.icon;
  const when = formatWhen(event.occurred_at);

  return (
    <div className="flex items-start gap-3 border-b border-border py-4 last:border-b-0">
      <div className={`rounded-full p-2 ${meta.tone}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm truncate">{event.title}</span>
          <Badge variant="outline" className="text-xs">
            {meta.label}
          </Badge>
          {event.status && (
            <Badge variant="secondary" className="text-xs capitalize">
              {String(event.status).replace(/_/g, ' ')}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
          {event.description}
        </p>
      </div>
      <time
        className="text-xs text-muted-foreground whitespace-nowrap shrink-0"
        dateTime={event.occurred_at}
        title={new Date(event.occurred_at).toLocaleString()}
      >
        {when}
      </time>
    </div>
  );
}

// Relative time formatting — short, friendly. Falls back to absolute
// date for anything older than a week.
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = Date.now();
  const diffSec = Math.round((now - d.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return d.toLocaleDateString();
}
