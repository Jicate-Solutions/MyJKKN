'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ContentLayout } from '@/components/layout/content-layout';
import { DashboardLayout } from '@/components/dashboard/dashboard-layout';
import { useDashboard } from '@/hooks/use-dashboard';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Plus,
  Settings,
  AlertCircle,
  RefreshCw,
  BarChart3,
  TrendingUp,
  Table,
  Activity
} from 'lucide-react';
import { DashboardWidgetType } from '@/types/dashboard';
import { toast } from 'react-hot-toast';

// Widget category icons
const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'kpi':
      return <TrendingUp className='h-4 w-4' />;
    case 'chart':
      return <BarChart3 className='h-4 w-4' />;
    case 'table':
      return <Table className='h-4 w-4' />;
    case 'feed':
      return <Activity className='h-4 w-4' />;
    default:
      return <Plus className='h-4 w-4' />;
  }
};

// Widget selection dialog
function WidgetSelectionDialog({
  open,
  onOpenChange,
  widgetTypes,
  onSelectWidget
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetTypes: Record<string, DashboardWidgetType[]>;
  onSelectWidget: (widgetTypeId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Add Widget to Dashboard</DialogTitle>
          <DialogDescription>
            Choose from available widgets to add to your dashboard
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-6'>
          {Object.entries(widgetTypes).map(([category, widgets]) => (
            <div key={category}>
              <h3 className='text-lg font-semibold mb-3 flex items-center gap-2'>
                {getCategoryIcon(category)}
                {category.charAt(0).toUpperCase() + category.slice(1)} Widgets
              </h3>

              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
                {widgets.map((widget) => (
                  <Card
                    key={widget.id}
                    className='cursor-pointer hover:shadow-md transition-shadow'
                    onClick={() => {
                      onSelectWidget(widget.id);
                      onOpenChange(false);
                    }}
                  >
                    <CardHeader className='pb-2'>
                      <CardTitle className='text-sm flex items-center gap-2'>
                        {getCategoryIcon(widget.category)}
                        {widget.widget_name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className='text-xs text-muted-foreground mb-2'>
                        {widget.description}
                      </p>
                      <div className='flex flex-wrap gap-1'>
                        <Badge variant='outline' className='text-xs'>
                          {widget.data_source}
                        </Badge>
                        <Badge variant='secondary' className='text-xs'>
                          {widget.category}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PersonalizedDashboardPage() {
  const {
    configurations,
    currentConfiguration,
    loading,
    error,
    switchConfiguration,
    addWidget,
    getWidgetTypesByCategory,
    refreshDashboard
  } = useDashboard();

  const [isEditing, setIsEditing] = useState(false);
  const [showWidgetDialog, setShowWidgetDialog] = useState(false);

  // Handle widget addition
  const handleAddWidget = async (widgetTypeId: string) => {
    try {
      await addWidget(widgetTypeId);
    } catch (error) {
      console.error('Error adding widget:', error);
    }
  };

  // Handle dashboard editing
  const handleEditDashboard = () => {
    setIsEditing(true);
  };

  const handleSaveDashboard = () => {
    setIsEditing(false);
    toast.success('Dashboard changes saved');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    refreshDashboard();
  };

  if (loading) {
    return (
      <ContentLayout title='Dashboard'>
        <DashboardSkeleton />
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Dashboard'>
        <div className='flex flex-col items-center justify-center min-h-[400px] max-w-[600px] mx-auto p-6 bg-red-50 rounded-lg border border-red-200'>
          <div className='text-red-500 mb-4'>
            <AlertCircle size={40} />
          </div>
          <h2 className='text-xl font-semibold mb-2'>
            Error Loading Dashboard
          </h2>
          <p className='text-destructive text-center mb-6'>{error}</p>
          <Button
            onClick={refreshDashboard}
            className='flex items-center gap-2'
          >
            <RefreshCw className='h-4 w-4' />
            Retry
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const widgetTypesByCategory = getWidgetTypesByCategory();

  return (
    <ContentLayout title='Dashboard'>
      <div className='space-y-6'>
        {/* Dashboard Controls */}
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-4'>
            <h1 className='text-2xl font-bold'>Personal Dashboard</h1>

            {configurations.length > 1 && (
              <Select
                value={currentConfiguration?.id}
                onValueChange={switchConfiguration}
              >
                <SelectTrigger className='w-[200px]'>
                  <SelectValue placeholder='Select dashboard' />
                </SelectTrigger>
                <SelectContent>
                  {configurations.map((config) => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.configuration_name}
                      {config.is_default && (
                        <Badge variant='secondary' className='ml-2 text-xs'>
                          Default
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <Button
            variant='outline'
            onClick={refreshDashboard}
            className='flex items-center gap-2'
          >
            <RefreshCw className='h-4 w-4' />
            Refresh
          </Button>
        </div>

        {/* Dashboard Layout */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <DashboardLayout
            configuration={currentConfiguration}
            isEditing={isEditing}
            onEdit={handleEditDashboard}
            onSave={handleSaveDashboard}
            onCancel={handleCancelEdit}
            onAddWidget={() => setShowWidgetDialog(true)}
          />
        </motion.div>

        {/* Widget Selection Dialog */}
        <WidgetSelectionDialog
          open={showWidgetDialog}
          onOpenChange={setShowWidgetDialog}
          widgetTypes={widgetTypesByCategory}
          onSelectWidget={handleAddWidget}
        />
      </div>
    </ContentLayout>
  );
}

// Loading skeleton for dashboard
function DashboardSkeleton() {
  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          <Skeleton className='h-8 w-64' />
          <Skeleton className='h-10 w-[200px]' />
        </div>
        <Skeleton className='h-10 w-32' />
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className='h-[300px]'>
            <CardHeader>
              <Skeleton className='h-6 w-32' />
              <Skeleton className='h-4 w-48' />
            </CardHeader>
            <CardContent>
              <Skeleton className='h-24 w-full mb-4' />
              <Skeleton className='h-4 w-24' />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
