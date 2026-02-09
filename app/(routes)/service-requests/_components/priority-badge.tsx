'use client';

import { Badge } from '@/components/ui/badge';
import { SERVICE_REQUEST_PRIORITY_CONFIG, ServiceRequestPriority } from '@/types/service-request';
import { cn } from '@/lib/utils';

export function PriorityBadge({ priority }: { priority: ServiceRequestPriority | null }) {
  if (!priority) return null;

  const config = SERVICE_REQUEST_PRIORITY_CONFIG[priority];
  if (!config) return <Badge variant="outline">{priority}</Badge>;

  return (
    <Badge variant="outline" className={cn(config.color, 'text-xs')}>
      {config.label}
    </Badge>
  );
}
