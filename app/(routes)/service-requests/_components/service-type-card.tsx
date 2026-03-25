'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText } from 'lucide-react';
import type { ServiceType } from '@/types/service-request';
import { SERVICE_TYPE_SCOPE_CONFIG } from '@/types/service-request';
import { SCOPE_ICONS } from './scope-icons';
import { cn } from '@/lib/utils';

interface ServiceTypeCardProps {
  serviceType: ServiceType;
  onSelect: (serviceType: ServiceType) => void;
  selected?: boolean;
}

export function ServiceTypeCard({ serviceType, onSelect, selected }: ServiceTypeCardProps) {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:border-primary/50',
        selected && 'ring-2 ring-primary border-primary'
      )}
      onClick={() => onSelect(serviceType)}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${serviceType.color}20` }}
          >
            <FileText className="h-6 w-6" style={{ color: serviceType.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">
              {serviceType.name}
            </h3>
            {serviceType.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {serviceType.description}
              </p>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              {serviceType.scope_level && serviceType.scope_level !== 'common' && (
                (() => {
                  const ScopeIcon = SCOPE_ICONS[serviceType.scope_level];
                  const scopeConfig = SERVICE_TYPE_SCOPE_CONFIG[serviceType.scope_level];
                  return (
                    <Badge className={cn('text-xs gap-1', scopeConfig.color)}>
                      <ScopeIcon className="h-3 w-3" />
                      {scopeConfig.label}
                    </Badge>
                  );
                })()
              )}
              {serviceType.allowed_roles.slice(0, 3).map((role) => (
                <Badge key={role} variant="outline" className="text-xs capitalize">
                  {role.replace(/_/g, ' ')}
                </Badge>
              ))}
              {serviceType.allowed_roles.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{serviceType.allowed_roles.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
