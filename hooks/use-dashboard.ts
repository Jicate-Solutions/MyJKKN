'use client';

import { useState, useCallback, useMemo } from 'react';
import { DashboardWidgetType } from '@/types/dashboard';

interface DashboardWidget {
  id: string;
  widget_type_id: string;
  position: number;
  column_span: number;
  row_span: number;
  settings?: Record<string, unknown>;
  widget_type?: DashboardWidgetType;
}

interface DashboardConfiguration {
  id: string;
  configuration_name: string;
  is_default: boolean;
  widgets: DashboardWidget[];
}

// Sample widget types for demo purposes
const sampleWidgetTypes: DashboardWidgetType[] = [
  {
    id: 'kpi-total-users',
    widget_name: 'Total Users',
    description: 'Shows total active users count',
    category: 'kpi',
    data_source: 'users'
  },
  {
    id: 'kpi-revenue',
    widget_name: 'Revenue',
    description: 'Shows total revenue metrics',
    category: 'kpi',
    data_source: 'billing'
  },
  {
    id: 'chart-user-growth',
    widget_name: 'User Growth',
    description: 'Line chart showing user growth over time',
    category: 'chart',
    data_source: 'analytics'
  },
  {
    id: 'chart-activity',
    widget_name: 'Activity Chart',
    description: 'Bar chart of daily activity',
    category: 'chart',
    data_source: 'activity'
  },
  {
    id: 'table-recent-users',
    widget_name: 'Recent Users',
    description: 'Table of recently registered users',
    category: 'table',
    data_source: 'users'
  },
  {
    id: 'feed-notifications',
    widget_name: 'Notifications Feed',
    description: 'Live feed of system notifications',
    category: 'feed',
    data_source: 'notifications'
  }
];

// Default configuration
const defaultConfiguration: DashboardConfiguration = {
  id: 'default',
  configuration_name: 'Default Dashboard',
  is_default: true,
  widgets: []
};

export function useDashboard() {
  const [configurations, setConfigurations] = useState<DashboardConfiguration[]>([
    defaultConfiguration
  ]);
  const [currentConfigId, setCurrentConfigId] = useState<string>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentConfiguration = useMemo(() => {
    return configurations.find(c => c.id === currentConfigId) || null;
  }, [configurations, currentConfigId]);

  const switchConfiguration = useCallback((configId: string) => {
    setCurrentConfigId(configId);
  }, []);

  const addWidget = useCallback(async (widgetTypeId: string) => {
    const widgetType = sampleWidgetTypes.find(wt => wt.id === widgetTypeId);
    if (!widgetType) return;

    setConfigurations(prev => {
      return prev.map(config => {
        if (config.id !== currentConfigId) return config;

        const newWidget: DashboardWidget = {
          id: `widget-${Date.now()}`,
          widget_type_id: widgetTypeId,
          position: config.widgets.length,
          column_span: 1,
          row_span: 1,
          widget_type: widgetType
        };

        return {
          ...config,
          widgets: [...config.widgets, newWidget]
        };
      });
    });
  }, [currentConfigId]);

  const removeWidget = useCallback((widgetId: string) => {
    setConfigurations(prev => {
      return prev.map(config => {
        if (config.id !== currentConfigId) return config;
        return {
          ...config,
          widgets: config.widgets.filter(w => w.id !== widgetId)
        };
      });
    });
  }, [currentConfigId]);

  const getWidgetTypesByCategory = useCallback(() => {
    const grouped: Record<string, DashboardWidgetType[]> = {};

    sampleWidgetTypes.forEach(wt => {
      if (!grouped[wt.category]) {
        grouped[wt.category] = [];
      }
      grouped[wt.category].push(wt);
    });

    return grouped;
  }, []);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    try {
      // In a real implementation, this would fetch from API
      await new Promise(resolve => setTimeout(resolve, 500));
      setError(null);
    } catch (err) {
      setError('Failed to refresh dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    configurations,
    currentConfiguration,
    loading,
    error,
    switchConfiguration,
    addWidget,
    removeWidget,
    getWidgetTypesByCategory,
    refreshDashboard
  };
}
