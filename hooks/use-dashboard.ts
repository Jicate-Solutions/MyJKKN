import { useState, useEffect } from 'react';
import { DashboardService } from '@/lib/services/dashboard/dashboard-service';
import {
  DashboardConfiguration,
  DashboardWidget,
  DashboardWidgetType,
  CreateDashboardConfigurationDto,
  CreateDashboardWidgetDto
} from '@/types/dashboard';
import { toast } from 'react-hot-toast';

export function useDashboard() {
  const [configurations, setConfigurations] = useState<
    DashboardConfiguration[]
  >([]);
  const [currentConfiguration, setCurrentConfiguration] =
    useState<DashboardConfiguration | null>(null);
  const [availableWidgetTypes, setAvailableWidgetTypes] = useState<
    DashboardWidgetType[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load configurations and widget types in parallel
      const [configs, widgetTypes] = await Promise.all([
        DashboardService.getUserDashboardConfigurations(),
        DashboardService.getAvailableWidgetTypes()
      ]);

      setConfigurations(configs);
      setAvailableWidgetTypes(widgetTypes);

      // Set current configuration to default or first one
      const defaultConfig =
        configs.find((c) => c.is_default) || configs[0] || null;
      setCurrentConfiguration(defaultConfig);

      // If no configurations exist, create a default one
      if (configs.length === 0) {
        try {
          const defaultConfig =
            await DashboardService.createDefaultConfiguration();
          setConfigurations([defaultConfig]);
          setCurrentConfiguration(defaultConfig);
        } catch (createError) {
          // If creation fails due to duplicate, try to fetch again
          console.warn('Failed to create default config, attempting to refetch:', createError);
          const retryConfigs = await DashboardService.getUserDashboardConfigurations();
          if (retryConfigs.length > 0) {
            setConfigurations(retryConfigs);
            const defaultConfig =
              retryConfigs.find((c) => c.is_default) || retryConfigs[0];
            setCurrentConfiguration(defaultConfig);
          } else {
            // If still no configs and creation failed, throw the error
            throw createError;
          }
        }
      }
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to load dashboard data'
      );
    } finally {
      setLoading(false);
    }
  };

  // Configuration management
  const createConfiguration = async (data: CreateDashboardConfigurationDto) => {
    try {
      const newConfig = await DashboardService.createDashboardConfiguration(
        data
      );
      setConfigurations((prev) => [newConfig, ...prev]);

      if (data.is_default) {
        // Update other configs to not be default
        setConfigurations((prev) =>
          prev.map((c) =>
            c.id === newConfig.id ? c : { ...c, is_default: false }
          )
        );
        setCurrentConfiguration(newConfig);
      }

      return newConfig;
    } catch (error) {
      console.error('Error creating configuration:', error);
      throw error;
    }
  };

  const updateConfiguration = async (
    id: string,
    data: Partial<DashboardConfiguration>
  ) => {
    try {
      const updatedConfig = await DashboardService.updateDashboardConfiguration(
        id,
        data
      );
      setConfigurations((prev) =>
        prev.map((c) => (c.id === id ? updatedConfig : c))
      );

      if (currentConfiguration?.id === id) {
        setCurrentConfiguration(updatedConfig);
      }

      return updatedConfig;
    } catch (error) {
      console.error('Error updating configuration:', error);
      throw error;
    }
  };

  const deleteConfiguration = async (id: string) => {
    try {
      await DashboardService.deleteDashboardConfiguration(id);
      setConfigurations((prev) => prev.filter((c) => c.id !== id));

      if (currentConfiguration?.id === id) {
        const remainingConfigs = configurations.filter((c) => c.id !== id);
        setCurrentConfiguration(remainingConfigs[0] || null);
      }
    } catch (error) {
      console.error('Error deleting configuration:', error);
      throw error;
    }
  };

  const switchConfiguration = (configId: string) => {
    const config = configurations.find((c) => c.id === configId);
    if (config) {
      setCurrentConfiguration(config);
    }
  };

  // Widget management
  const addWidget = async (
    widgetTypeId: string,
    position?: { x: number; y: number; w: number; h: number }
  ) => {
    if (!currentConfiguration) {
      toast.error('No active configuration');
      return;
    }

    try {
      const widgetData: CreateDashboardWidgetDto = {
        widget_type_id: widgetTypeId,
        position_x: position?.x || 0,
        position_y: position?.y || 0,
        width: position?.w || 3,
        height: position?.h || 2,
        widget_config: {},
        is_visible: true,
        sort_order: currentConfiguration.layout_config.length
      };

      const newWidget = await DashboardService.addWidgetToConfiguration(
        currentConfiguration.id,
        widgetData
      );

      // Update current configuration with new widget
      setCurrentConfiguration((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          layout_config: [...prev.layout_config, newWidget]
        };
      });

      // Update configurations list
      setConfigurations((prev) =>
        prev.map((c) =>
          c.id === currentConfiguration.id
            ? { ...c, layout_config: [...c.layout_config, newWidget] }
            : c
        )
      );

      toast.success('Widget added successfully');
      return newWidget;
    } catch (error) {
      console.error('Error adding widget:', error);
      toast.error('Failed to add widget');
      throw error;
    }
  };

  const removeWidget = async (widgetId: string) => {
    if (!currentConfiguration) return;

    try {
      await DashboardService.removeWidgetFromConfiguration(widgetId);

      // Update current configuration
      setCurrentConfiguration((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          layout_config: prev.layout_config.filter((w) => w.id !== widgetId)
        };
      });

      // Update configurations list
      setConfigurations((prev) =>
        prev.map((c) =>
          c.id === currentConfiguration.id
            ? {
                ...c,
                layout_config: c.layout_config.filter((w) => w.id !== widgetId)
              }
            : c
        )
      );

      toast.success('Widget removed successfully');
    } catch (error) {
      console.error('Error removing widget:', error);
      toast.error('Failed to remove widget');
      throw error;
    }
  };

  const updateWidget = async (
    widgetId: string,
    data: Partial<DashboardWidget>
  ) => {
    try {
      const updatedWidget = await DashboardService.updateWidget(widgetId, data);

      // Update current configuration
      setCurrentConfiguration((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          layout_config: prev.layout_config.map((w) =>
            w.id === widgetId ? { ...w, ...updatedWidget } : w
          )
        };
      });

      return updatedWidget;
    } catch (error) {
      console.error('Error updating widget:', error);
      throw error;
    }
  };

  const refreshDashboard = async () => {
    await loadDashboardData();
  };

  // Get widget types by category for easier UI rendering
  const getWidgetTypesByCategory = () => {
    return availableWidgetTypes.reduce((acc, widget) => {
      if (!acc[widget.category]) {
        acc[widget.category] = [];
      }
      acc[widget.category].push(widget);
      return acc;
    }, {} as Record<string, DashboardWidgetType[]>);
  };

  return {
    // State
    configurations,
    currentConfiguration,
    availableWidgetTypes,
    loading,
    error,

    // Configuration actions
    createConfiguration,
    updateConfiguration,
    deleteConfiguration,
    switchConfiguration,

    // Widget actions
    addWidget,
    removeWidget,
    updateWidget,

    // Utility actions
    refreshDashboard,
    getWidgetTypesByCategory,

    // Derived state
    hasConfigurations: configurations.length > 0,
    hasWidgets: (currentConfiguration?.layout_config?.length ?? 0) > 0
  };
}
