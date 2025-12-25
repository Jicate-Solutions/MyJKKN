'use client';

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
import {
  Plus,
  TrendingUp,
  BarChart3,
  Table,
  Activity
} from 'lucide-react';
import type { DashboardWidgetType } from '@/types/dashboard';

interface WidgetSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetTypesByCategory: Record<string, DashboardWidgetType[]>;
  onSelectWidget: (widgetTypeId: string) => void;
}

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

export function WidgetSelectionDialog({
  open,
  onOpenChange,
  widgetTypesByCategory,
  onSelectWidget
}: WidgetSelectionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-4xl max-h-[80vh] overflow-y-auto mx-4'>
        <DialogHeader>
          <DialogTitle className='text-lg sm:text-xl'>
            Add Widget to Dashboard
          </DialogTitle>
          <DialogDescription className='text-sm'>
            Choose from available widgets to add to your dashboard
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4 sm:space-y-6'>
          {Object.entries(widgetTypesByCategory).map(([category, widgets]) => (
            <div key={category}>
              <h3 className='text-base sm:text-lg font-semibold mb-2 sm:mb-3 flex items-center gap-2'>
                {getCategoryIcon(category)}
                {category.charAt(0).toUpperCase() + category.slice(1)} Widgets
              </h3>

              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3'>
                {widgets.map((widget) => (
                  <Card
                    key={widget.id}
                    className='cursor-pointer hover:shadow-md transition-shadow'
                    onClick={() => {
                      onSelectWidget(widget.id);
                      onOpenChange(false);
                    }}
                  >
                    <CardHeader className='pb-2 p-3 sm:p-4'>
                      <CardTitle className='text-xs sm:text-sm flex items-center gap-2'>
                        {getCategoryIcon(widget.category)}
                        {widget.widget_name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='p-3 sm:p-4 pt-0'>
                      <p className='text-xs text-muted-foreground mb-2 leading-relaxed'>
                        {widget.description}
                      </p>
                      <div className='flex flex-wrap gap-1'>
                        <Badge
                          variant='outline'
                          className='text-xs px-1.5 py-0.5'
                        >
                          {widget.data_source}
                        </Badge>
                        <Badge
                          variant='secondary'
                          className='text-xs px-1.5 py-0.5'
                        >
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
