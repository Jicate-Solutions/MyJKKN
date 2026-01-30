export interface DashboardWidgetType {
  id: string;
  widget_name: string;
  description: string;
  category: 'kpi' | 'chart' | 'table' | 'feed' | string;
  data_source: string;
  default_settings?: Record<string, unknown>;
  min_column_span?: number;
  max_column_span?: number;
  min_row_span?: number;
  max_row_span?: number;
}

export interface DashboardWidget {
  id: string;
  configuration_id: string;
  widget_type_id: string;
  position: number;
  column_span: number;
  row_span: number;
  settings?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  widget_type?: DashboardWidgetType;
}

export interface DashboardConfiguration {
  id: string;
  user_id: string;
  configuration_name: string;
  is_default: boolean;
  layout_type?: 'grid' | 'freeform';
  created_at?: string;
  updated_at?: string;
  widgets?: DashboardWidget[];
}

export interface DashboardPreferences {
  theme?: 'light' | 'dark' | 'system';
  refresh_interval?: number;
  compact_mode?: boolean;
  show_labels?: boolean;
}
