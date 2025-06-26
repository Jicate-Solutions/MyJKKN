'use client';

import { useState, useEffect } from 'react';
import { DashboardWidget } from './dashboard-widget';
import {
  DashboardWidget as DashboardWidgetType,
  DashboardConfiguration
} from '@/types/dashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Settings, Save, X } from 'lucide-react';

interface DashboardLayoutProps {
  configuration: DashboardConfiguration | null;
  isEditing?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onAddWidget?: () => void;
  onRemoveWidget?: (widgetId: string) => void;
  onUpdateWidget?: (
    widgetId: string,
    data: Partial<DashboardWidgetType>
  ) => void;
}

export function DashboardLayout({
  configuration,
  isEditing = false,
  onEdit,
  onSave,
  onCancel,
  onAddWidget,
  onRemoveWidget,
  onUpdateWidget
}: DashboardLayoutProps) {
  const [widgets, setWidgets] = useState<DashboardWidgetType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (configuration?.layout_config) {
      setWidgets(configuration.layout_config);
    }
    setLoading(false);
  }, [configuration]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!configuration) {
    return <EmptyDashboard onAddWidget={onAddWidget} />;
  }

  return (
    <div className='w-full'>
      {/* Dashboard Header */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-2xl font-bold'>
            {configuration.configuration_name}
          </h1>
          <p className='text-sm text-muted-foreground'>
            {isEditing ? 'Edit mode: Manage your widgets' : 'Viewing dashboard'}
          </p>
        </div>

        <div className='flex items-center gap-2'>
          {isEditing ? (
            <>
              <Button variant='outline' onClick={onCancel}>
                <X className='h-4 w-4 mr-2' />
                Cancel
              </Button>
              <Button onClick={onSave}>
                <Save className='h-4 w-4 mr-2' />
                Save Changes
              </Button>
            </>
          ) : (
            <>
              <Button variant='outline' onClick={onAddWidget}>
                <Plus className='h-4 w-4 mr-2' />
                Add Widget
              </Button>
              <Button variant='outline' onClick={onEdit}>
                <Settings className='h-4 w-4 mr-2' />
                Edit Dashboard
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Widgets Grid */}
      {widgets.length > 0 ? (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
          {widgets.map((widget) => (
            <div key={widget.id} className='min-h-[300px]'>
              <DashboardWidget
                widget={widget}
                isEditing={isEditing}
                onRemove={onRemoveWidget}
                onConfigure={(widget) => {
                  // Handle widget configuration - could open a config modal
                  console.log('Configure widget:', widget);
                }}
                className='h-full'
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyDashboard onAddWidget={onAddWidget} />
      )}
    </div>
  );
}

function EmptyDashboard({ onAddWidget }: { onAddWidget?: () => void }) {
  return (
    <Card className='border-dashed border-2 border-muted-foreground/25'>
      <CardContent className='flex flex-col items-center justify-center min-h-[400px] p-8 text-center'>
        <div className='rounded-full bg-muted p-4 mb-4'>
          <Plus className='h-8 w-8 text-muted-foreground' />
        </div>
        <h3 className='text-lg font-semibold mb-2'>No widgets configured</h3>
        <p className='text-sm text-muted-foreground mb-6 max-w-sm'>
          Add widgets to your dashboard to visualize your data and track
          important metrics.
        </p>
        <Button onClick={onAddWidget}>
          <Plus className='h-4 w-4 mr-2' />
          Add Your First Widget
        </Button>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <Skeleton className='h-8 w-64 mb-2' />
          <Skeleton className='h-4 w-48' />
        </div>
        <div className='flex gap-2'>
          <Skeleton className='h-10 w-32' />
          <Skeleton className='h-10 w-32' />
        </div>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className='h-64'>
            <CardContent className='p-6'>
              <Skeleton className='h-6 w-32 mb-4' />
              <Skeleton className='h-16 w-full mb-4' />
              <Skeleton className='h-4 w-24' />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
