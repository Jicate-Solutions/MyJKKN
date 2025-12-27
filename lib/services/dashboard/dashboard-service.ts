import { createClientSupabaseClient } from '@/lib/supabase/client';
import { UserService } from '@/lib/services/users/user-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { StudentWidgetService } from '@/lib/services/dashboard/student-widget-service';
import {
  DashboardConfiguration,
  DashboardWidget,
  DashboardWidgetType,
  DashboardMetrics,
  WidgetData,
  CreateDashboardConfigurationDto,
  UpdateDashboardConfigurationDto,
  CreateDashboardWidgetDto,
  UpdateDashboardWidgetDto,
  DashboardListResponse
} from '@/types/dashboard';
import { toast } from 'react-hot-toast';

export class DashboardService {
  private static supabase = createClientSupabaseClient();

  // Widget Types Management
  static async getAvailableWidgetTypes(): Promise<DashboardWidgetType[]> {
    try {
      const response = await fetch('/api/dashboard/widget-types');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch widget types');
      }

      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching widget types:', error);
      throw error;
    }
  }

  static async getWidgetTypesByCategory(): Promise<
    Record<string, DashboardWidgetType[]>
  > {
    try {
      const widgetTypes = await this.getAvailableWidgetTypes();

      return widgetTypes.reduce((acc, widget) => {
        if (!acc[widget.category]) {
          acc[widget.category] = [];
        }
        acc[widget.category].push(widget);
        return acc;
      }, {} as Record<string, DashboardWidgetType[]>);
    } catch (error) {
      console.error('Error grouping widget types:', error);
      throw error;
    }
  }

  // Dashboard Configuration Management
  static async getUserDashboardConfigurations(): Promise<
    DashboardConfiguration[]
  > {
    try {
      const response = await fetch('/api/dashboard/configurations');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to fetch dashboard configurations'
        );
      }

      const data = await response.json();
      return data || [];
    } catch (error) {
      console.error('Error fetching dashboard configurations:', error);
      throw error;
    }
  }

  static async getDefaultDashboardConfiguration(): Promise<DashboardConfiguration | null> {
    try {
      const { data, error } = await this.supabase
        .from('dashboard_configurations')
        .select(
          `
          *,
          dashboard_widgets (
            *,
            widget_type:dashboard_widget_types (*)
          )
        `
        )
        .eq('is_default', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No default configuration found
          return null;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching default configuration:', error);
      throw error;
    }
  }

  static async createDashboardConfiguration(
    data: CreateDashboardConfigurationDto
  ): Promise<DashboardConfiguration> {
    try {
      const response = await fetch('/api/dashboard/configurations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to create dashboard configuration'
        );
      }

      const config = await response.json();
      toast.success('Dashboard configuration created successfully');
      return config;
    } catch (error) {
      console.error('Error creating dashboard configuration:', error);
      toast.error('Failed to create dashboard configuration');
      throw error;
    }
  }

  static async updateDashboardConfiguration(
    id: string,
    data: UpdateDashboardConfigurationDto
  ): Promise<DashboardConfiguration> {
    try {
      const response = await fetch(`/api/dashboard/configurations?id=${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to update dashboard configuration'
        );
      }

      const config = await response.json();
      toast.success('Dashboard configuration updated successfully');
      return config;
    } catch (error) {
      console.error('Error updating dashboard configuration:', error);
      toast.error('Failed to update dashboard configuration');
      throw error;
    }
  }

  static async deleteDashboardConfiguration(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/dashboard/configurations?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to delete dashboard configuration'
        );
      }

      toast.success('Dashboard configuration deleted successfully');
    } catch (error) {
      console.error('Error deleting dashboard configuration:', error);
      toast.error('Failed to delete dashboard configuration');
      throw error;
    }
  }

  // Widget Management
  static async addWidgetToConfiguration(
    configurationId: string,
    widget: CreateDashboardWidgetDto
  ): Promise<DashboardWidget> {
    try {
      const response = await fetch('/api/dashboard/widgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ...widget, configuration_id: configurationId })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || 'Failed to add widget to configuration'
        );
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error adding widget to configuration:', error);
      throw error;
    }
  }

  static async updateWidget(
    widgetId: string,
    data: UpdateDashboardWidgetDto
  ): Promise<DashboardWidget> {
    try {
      const response = await fetch(`/api/dashboard/widgets?id=${widgetId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update widget');
      }

      const widget = await response.json();
      return widget;
    } catch (error) {
      console.error('Error updating widget:', error);
      throw error;
    }
  }

  static async removeWidgetFromConfiguration(widgetId: string): Promise<void> {
    try {
      const response = await fetch(`/api/dashboard/widgets?id=${widgetId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove widget');
      }
    } catch (error) {
      console.error('Error removing widget from configuration:', error);
      throw error;
    }
  }

  static async updateWidgetLayout(
    configurationId: string,
    widgets: Array<{
      id: string;
      position_x: number;
      position_y: number;
      width: number;
      height: number;
    }>
  ): Promise<void> {
    try {
      const updatePromises = widgets.map((widget) =>
        (this.supabase
          .from('dashboard_widgets') as any)
          .update({
            position_x: widget.position_x,
            position_y: widget.position_y,
            width: widget.width,
            height: widget.height
          })
          .eq('id', widget.id)
      );

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error updating widget layout:', error);
      throw error;
    }
  }

  // Data Aggregation for Widgets
  static async getWidgetData(
    widgetType: DashboardWidgetType,
    config: Record<string, any> = {}
  ): Promise<WidgetData> {
    try {
      switch (widgetType.data_source) {
        case 'users':
          return await this.getUserWidgetData(widgetType.widget_key, config);
        case 'students':
          return await this.getStudentWidgetData(widgetType.widget_key, config);
        case 'organizations':
          return await this.getOrganizationWidgetData(
            widgetType.widget_key,
            config
          );
        case 'academic':
          return await this.getAcademicWidgetData(
            widgetType.widget_key,
            config
          );
        case 'staff':
          return await this.getStaffWidgetData(widgetType.widget_key, config);
        case 'billing':
          return await this.getBillingWidgetData(widgetType.widget_key, config);
        case 'applications':
          return await this.getApplicationWidgetData(
            widgetType.widget_key,
            config
          );
        case 'admissions':
          return await this.getAdmissionWidgetData(
            widgetType.widget_key,
            config
          );
        case 'resources':
          return await this.getResourceWidgetData(
            widgetType.widget_key,
            config
          );
        case 'activity':
          return await this.getActivityWidgetData(
            widgetType.widget_key,
            config
          );
        case 'system':
          return await this.getSystemWidgetData(widgetType.widget_key, config);
        // Student-specific widget data sources
        case 'student_profile':
        case 'student_attendance':
        case 'student_billing':
        case 'student_timetable':
        case 'student_results':
        case 'student_announcements':
          return await this.getStudentPortalWidgetData(
            widgetType.widget_key,
            config
          );
        default:
          throw new Error(`Unknown data source: ${widgetType.data_source}`);
      }
    } catch (error) {
      console.error(
        `Error fetching data for widget ${widgetType.widget_key}:`,
        error
      );
      // Return fallback data
      return {
        value: 0,
        label: 'Error loading data'
      };
    }
  }

  // Data source methods
  private static async getUserWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Handle special welcome message widget
    if (widgetKey === 'welcome_message') {
      return {
        value: 'Welcome',
        label: 'Personal Dashboard',
        customData: {
          type: 'welcome',
          showGreeting: config.showGreeting !== false,
          showExploreButton: config.showExploreButton !== false
        }
      };
    }

    const userStats = await UserService.getUserStats();

    switch (widgetKey) {
      case 'total_users':
        return {
          value: userStats.total,
          trend: {
            direction: 'up',
            percentage: Math.floor(Math.random() * 10) + 1,
            period: config.timeframe || 'month'
          }
        };

      case 'users_by_role':
        return {
          value: userStats.total,
          chartData: Object.entries(userStats.byRole || {}).map(
            ([name, count]) => ({
              name: name.replace('_', ' '),
              count
            })
          )
        };

      case 'users_by_status':
        return {
          value: userStats.active,
          chartData: [
            { name: 'Active', value: userStats.active, fill: '#10B981' },
            { name: 'Inactive', value: userStats.inactive, fill: '#6B7280' }
          ]
        };

      case 'recent_users':
        const users = await UserService.getUsers({
          page: 1,
          limit: config.limit || 10
        });
        return {
          value: users.data.length,
          tableData: users.data
        };

      default:
        return { value: 0 };
    }
  }

  private static async getStudentWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder - would implement with actual student service
    switch (widgetKey) {
      case 'total_students':
        return {
          value: 1538,
          trend: {
            direction: 'up',
            percentage: 5,
            period: 'semester'
          }
        };
      default:
        return { value: 0 };
    }
  }

  private static async getOrganizationWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    switch (widgetKey) {
      case 'total_institutions':
        const institutions = await OrganizationService.getInstitutions({
          isActive: config.showActiveOnly
        });
        return {
          value: institutions.metadata.total,
          trend: {
            direction: 'stable',
            percentage: 0,
            period: 'month'
          }
        };

      case 'institutions_by_type':
        const allInstitutions = await OrganizationService.getInstitutions({});
        const typeGroups = allInstitutions.data.reduce((acc, inst) => {
          const type = inst.category || 'Other';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return {
          value: allInstitutions.metadata.total,
          chartData: Object.entries(typeGroups).map(([name, count]) => ({
            name,
            count
          }))
        };

      default:
        return { value: 0 };
    }
  }

  private static async getAcademicWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder implementations - would integrate with actual academic services
    switch (widgetKey) {
      case 'staff_planning':
        return {
          value: 85,
          label: 'Utilization %',
          additionalInfo: { total_planned: 120, total_assigned: 102 }
        };
      case 'timetable_coverage':
        return {
          value: 92,
          label: 'Coverage %',
          additionalInfo: { scheduled: 184, planned: 200 }
        };
      default:
        return { value: 0 };
    }
  }

  private static async getStaffWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder implementations
    return { value: 0 };
  }

  private static async getBillingWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder implementations
    return { value: 0 };
  }

  private static async getApplicationWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder implementations
    return { value: 0 };
  }

  private static async getAdmissionWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder implementations
    return { value: 0 };
  }

  private static async getResourceWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder implementations
    return { value: 0 };
  }

  private static async getActivityWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    // Placeholder implementations
    return { value: 0 };
  }

  private static async getSystemWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    switch (widgetKey) {
      case 'analog_clock':
        return {
          value: new Date().toLocaleTimeString(),
          label: 'Current Time',
          customData: {
            type: 'clock',
            format: config.format || '12hour',
            style: config.style || '3d'
          }
        };

      case 'ai_chip':
        return {
          value: 'AI Powered',
          label: 'Intelligent System',
          customData: {
            type: 'ai_chip',
            showDescription: config.showDescription !== false,
            animated: config.animated !== false
          }
        };

      case 'weather_card':
        return {
          value: '28°C',
          label: 'Current Weather',
          customData: {
            type: 'weather',
            showDetails: config.showDetails !== false,
            location: config.location || 'Chennai'
          }
        };

      default:
        return { value: 0 };
    }
  }

  // Create default configuration for new users
  static async createDefaultConfiguration(): Promise<DashboardConfiguration> {
    const defaultWidgets = [
      // Standard dashboard widgets (special widgets are now part of fixed layout)
      {
        widget_key: 'total_users',
        position_x: 0,
        position_y: 0,
        width: 3,
        height: 2
      },
      {
        widget_key: 'total_institutions',
        position_x: 3,
        position_y: 0,
        width: 3,
        height: 2
      },
      {
        widget_key: 'total_students',
        position_x: 6,
        position_y: 0,
        width: 3,
        height: 2
      },
      {
        widget_key: 'users_by_role',
        position_x: 0,
        position_y: 2,
        width: 6,
        height: 4
      },
      {
        widget_key: 'users_by_status',
        position_x: 6,
        position_y: 2,
        width: 6,
        height: 4
      }
    ];

    const widgetTypes = await this.getAvailableWidgetTypes();

    try {
      // Try to create configuration with a unique name
      const configName = 'Default Dashboard';
      let config;
      let attempts = 0;

      while (attempts < 3) {
        try {
          config = await this.createDashboardConfiguration({
            configuration_name:
              attempts === 0 ? configName : `${configName} ${attempts + 1}`,
            is_default: true
          });
          break; // Success, exit loop
        } catch (createError: any) {
          if (createError?.message?.includes('duplicate key') && attempts < 2) {
            attempts++;
            continue; // Try with a different name
          }
          throw createError; // Rethrow if not a duplicate key error or max attempts reached
        }
      }

      if (!config) {
        throw new Error(
          'Failed to create default dashboard configuration after multiple attempts'
        );
      }

      // Add default widgets
      for (const widgetDef of defaultWidgets) {
        const widgetType = widgetTypes.find(
          (wt) => wt.widget_key === widgetDef.widget_key
        );
        if (widgetType) {
          await this.addWidgetToConfiguration(config.id, {
            widget_type_id: widgetType.id,
            position_x: widgetDef.position_x,
            position_y: widgetDef.position_y,
            width: widgetDef.width,
            height: widgetDef.height,
            widget_config: widgetType.default_config
          });
        }
      }

      return config;
    } catch (error) {
      console.error('Error creating default configuration:', error);
      throw error;
    }
  }

  /**
   * Fetch student portal widget data via API
   * Student widgets require server-side data fetching with user context
   */
  private static async getStudentPortalWidgetData(
    widgetKey: string,
    config: Record<string, any>
  ): Promise<WidgetData> {
    try {
      const configParam = encodeURIComponent(JSON.stringify(config));
      const response = await fetch(
        `/api/dashboard/student-widgets?widget_key=${widgetKey}&config=${configParam}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch student widget data');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error fetching student widget ${widgetKey}:`, error);
      return {
        value: 'Error',
        label: 'Failed to load',
        additionalInfo: {}
      };
    }
  }
}
