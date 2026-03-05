'use client';

import { Badge } from '@/components/ui/badge';
import type { EventStatus } from '@/types/startup-studio';

const statusConfig: Record<EventStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  registration_open: { label: 'Registration Open', variant: 'default' },
  registration_closed: { label: 'Registration Closed', variant: 'outline' },
  build_day: { label: 'Build Day', variant: 'default' },
  demo_day: { label: 'Demo Day', variant: 'default' },
  closed: { label: 'Closed', variant: 'secondary' },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const config = statusConfig[status] || { label: status, variant: 'secondary' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
