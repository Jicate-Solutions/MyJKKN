'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  useServiceTypes,
  useDeactivateServiceType,
  useUpdateServiceType,
} from '@/hooks/service-requests/use-service-types';
import { Plus, FileText, Settings, Edit, Bus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ServiceType } from '@/types/service-request';

export default function ServiceTypesPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const { data: serviceTypes, isLoading, refetch } = useServiceTypes(
    showInactive ? undefined : { is_active: true }
  );
  const updateServiceType = useUpdateServiceType();
  const { toast } = useToast();

  const hasTransportType = serviceTypes?.some((t) => t.slug === 'transport-request');

  const handleSeedTransport = async () => {
    setIsSeeding(true);
    try {
      const res = await fetch('/api/service-requests/types/seed-transport', {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to seed');
      toast({ title: 'Transport service type created successfully' });
      refetch();
    } catch (error) {
      toast({
        title: 'Failed to seed transport type',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const handleToggleActive = (type: ServiceType) => {
    updateServiceType.mutate({
      id: type.id,
      data: { is_active: !type.is_active },
    });
  };

  return (
    <ContentLayout title="Service Types">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-requests">Service Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Types</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold">Service Types</h1>
            <p className="text-muted-foreground">
              Manage service request types and their configurations
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={showInactive}
                onCheckedChange={setShowInactive}
                id="show-inactive"
              />
              <label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
                Show inactive
              </label>
            </div>
            {!hasTransportType && !isLoading && (
              <Button variant="outline" onClick={handleSeedTransport} disabled={isSeeding}>
                {isSeeding ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Bus className="h-4 w-4 mr-2" />
                )}
                Seed Default Transport
              </Button>
            )}
            <Button asChild>
              <Link href="/service-requests/types/new">
                <Plus className="h-4 w-4 mr-2" />
                New Type
              </Link>
            </Button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center items-center min-h-[400px]">
            <p className="text-sm text-muted-foreground">Loading service types...</p>
          </div>
        ) : serviceTypes && serviceTypes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {serviceTypes.map((type) => (
              <Card key={type.id} className={!type.is_active ? 'opacity-60' : ''}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${type.color}20` }}
                      >
                        <FileText className="h-5 w-5" style={{ color: type.color }} />
                      </div>
                      <div>
                        <h3 className="font-semibold">{type.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{type.slug}</p>
                      </div>
                    </div>
                    {!type.is_active && (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </div>

                  {type.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {type.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mb-4">
                    {type.allowed_roles.slice(0, 3).map((role) => (
                      <Badge key={role} variant="outline" className="text-xs capitalize">
                        {role.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                    {type.allowed_roles.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{type.allowed_roles.length - 3}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={type.is_active}
                        onCheckedChange={() => handleToggleActive(type)}
                        disabled={updateServiceType.isPending}
                      />
                      <span className="text-xs text-muted-foreground">
                        {type.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/service-requests/types/${type.id}`}>
                          <Settings className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/service-requests/types/${type.id}/edit`}>
                          <Edit className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">No service types configured yet</p>
              <Button asChild variant="outline">
                <Link href="/service-requests/types/new">Create your first service type</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
