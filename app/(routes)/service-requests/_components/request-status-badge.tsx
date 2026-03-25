'use client';

import { Badge } from '@/components/ui/badge';
import { SERVICE_REQUEST_STATUS_CONFIG, ServiceRequestStatus } from '@/types/service-request';
import { cn } from '@/lib/utils';

export function RequestStatusBadge({ status }: { status: ServiceRequestStatus }) {
  const config = SERVICE_REQUEST_STATUS_CONFIG[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;

  return (
    <Badge variant={config.variant as any} className={cn(config.color, 'text-xs')}>
      {config.label}
    </Badge>
  );
}
