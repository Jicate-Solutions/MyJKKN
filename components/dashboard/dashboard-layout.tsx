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
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0 mb-4 sm:mb-6'>
        <div className='space-y-1'>
          <h1 className='text-xl sm:text-2xl font-bold'>
            {configuration.configuration_name}
          </h1>
          <p className='text-xs sm:text-sm text-muted-foreground'>
            {isEditing ? 'Edit mode: Manage your widgets' : 'Viewing dashboard'}
          </p>
        </div>

        <div className='flex flex-col xs:flex-row items-stretch xs:items-center gap-2 w-full sm:w-auto'>
          {isEditing ? (
            <>
              <Button
                variant='outline'
                onClick={onCancel}
                className='w-full xs:w-auto h-9'
              >
                <X className='h-4 w-4 mr-2' />
                <span className='hidden xs:inline'>Cancel</span>
                <span className='xs:hidden'>Cancel</span>
              </Button>
              <Button onClick={onSave} className='w-full xs:w-auto h-9'>
                <Save className='h-4 w-4 mr-2' />
                <span className='hidden xs:inline'>Save Changes</span>
                <span className='xs:hidden'>Save</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant='outline'
                onClick={onAddWidget}
                className='w-full xs:w-auto h-9'
              >
                <Plus className='h-4 w-4 mr-2' />
                <span className='hidden xs:inline'>Add Widget</span>
                <span className='xs:hidden'>Add</span>
              </Button>
              <Button
                variant='outline'
                onClick={onEdit}
                className='w-full xs:w-auto h-9'
              >
                <Settings className='h-4 w-4 mr-2' />
                <span className='hidden xs:inline'>Edit Dashboard</span>
                <span className='xs:hidden'>Edit</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Widgets Grid */}
      {widgets.length > 0 ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6'>
          {widgets.map((widget) => (
            <div key={widget.id} className='min-h-[250px] sm:min-h-[300px]'>
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
      <CardContent className='flex flex-col items-center justify-center min-h-[300px] sm:min-h-[400px] p-4 sm:p-8 text-center'>
        <div className='rounded-full bg-muted p-3 sm:p-4 mb-3 sm:mb-4'>
          <Plus className='h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground' />
        </div>
        <h3 className='text-base sm:text-lg font-semibold mb-2'>
          No widgets configured
        </h3>
        <p className='text-xs sm:text-sm text-muted-foreground mb-4 sm:mb-6 max-w-sm px-2'>
          Add widgets to your dashboard to visualize your data and track
          important metrics.
        </p>
        <Button onClick={onAddWidget} className='w-full xs:w-auto'>
          <Plus className='h-4 w-4 mr-2' />
          Add Your First Widget
        </Button>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className='space-y-4 sm:space-y-6'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-0'>
        <div className='space-y-1 sm:space-y-2'>
          <Skeleton className='h-6 sm:h-8 w-48 sm:w-64' />
          <Skeleton className='h-3 sm:h-4 w-32 sm:w-48' />
        </div>
        <div className='flex flex-col xs:flex-row gap-2 w-full sm:w-auto'>
          <Skeleton className='h-9 w-full xs:w-24 sm:w-32' />
          <Skeleton className='h-9 w-full xs:w-24 sm:w-32' />
        </div>
      </div>

      <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4'>
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className='h-48 sm:h-64'>
            <CardContent className='p-3 sm:p-6'>
              <Skeleton className='h-4 sm:h-6 w-24 sm:w-32 mb-3 sm:mb-4' />
              <Skeleton className='h-12 sm:h-16 w-full mb-3 sm:mb-4' />
              <Skeleton className='h-3 sm:h-4 w-16 sm:w-24' />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
