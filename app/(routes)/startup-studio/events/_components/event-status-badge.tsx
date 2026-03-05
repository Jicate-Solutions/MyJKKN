'use client';

import { Badge } from '@/components/ui/badge';
import type { EventStatus } from '@/types/startup-studio';

const statusConfig: Record<EventStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground hover:bg-muted' },
  registration_open: { label: 'Active', className: 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
  registration_closed: { label: 'Closed', className: 'bg-muted text-muted-foreground hover:bg-muted' },
  build_day: { label: 'Active', className: 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
  demo_day: { label: 'Active', className: 'bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400' },
  closed: { label: 'Inactive', className: 'bg-muted text-muted-foreground hover:bg-muted' },
};

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const config = statusConfig[status] || { label: status, className: '' };
  return <Badge variant="secondary" className={config.className}>{config.label}</Badge>;
}
