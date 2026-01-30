'use client';

import { useMemo } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import {
  useDashboardPreferences,
  useUpdatePreference,
} from '@/hooks/dashboard/use-dashboard-preferences';
import { getWidgetsByRole } from './widget-registry';

interface WidgetVisibilitySettingsProps {
  userId: string;
  role: string;
}

export function WidgetVisibilitySettings({
  userId,
  role,
}: WidgetVisibilitySettingsProps) {
  const { data: preferences, isLoading } = useDashboardPreferences(
    userId,
    role
  );
  const updateMutation = useUpdatePreference();

  const widgets = useMemo(() => getWidgetsByRole(role), [role]);

  // Group widgets by category
  const widgetsByCategory = useMemo(() => {
    const grouped: Record<string, typeof widgets> = {};
    widgets.forEach((widget) => {
      if (!grouped[widget.category]) {
        grouped[widget.category] = [];
      }
      grouped[widget.category].push(widget);
    });
    return grouped;
  }, [widgets]);

  const handleToggle = (widgetId: string, isVisible: boolean) => {
    updateMutation.mutate({
      userId,
      role,
      widgetId,
      isVisible,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(widgetsByCategory).map(([category, categoryWidgets]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold mb-3 text-foreground">
            {category}
          </h3>
          <div className="space-y-3">
            {categoryWidgets.map((widget) => {
              const isVisible = preferences?.[widget.id] ?? true;
              const isDisabled = updateMutation.isPending;

              return (
                <div
                  key={widget.id}
                  className={`flex items-start justify-between p-3 rounded-lg border transition-colors ${
                    isVisible
                      ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
                      : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex-1 pr-4">
                    <Label
                      htmlFor={widget.id}
                      className={`text-sm font-medium cursor-pointer ${
                        isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {widget.title}
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {widget.description}
                    </p>
                  </div>
                  <Switch
                    id={widget.id}
                    checked={isVisible}
                    onCheckedChange={(checked) =>
                      handleToggle(widget.id, checked)
                    }
                    disabled={isDisabled}
                    className="shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
