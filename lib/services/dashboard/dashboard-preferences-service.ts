import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface DashboardPreference {
  widget_id: string;
  is_visible: boolean;
}

export class DashboardPreferencesService {
  /**
   * Get user's dashboard preferences for their current role
   */
  static async getPreferences(
    userId: string,
    role: string
  ): Promise<Record<string, boolean>> {
    const supabase = createClientSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('user_dashboard_preferences')
      .select('widget_id, is_visible')
      .eq('user_id', userId)
      .eq('role', role) as { data: DashboardPreference[] | null; error: Error | null };

    if (error) {
      logger.error('dashboard/preferences', 'Failed to fetch preferences', error);
      return {};
    }

    if (!data) return {};

    return data.reduce((acc, pref) => {
      acc[pref.widget_id] = pref.is_visible;
      return acc;
    }, {} as Record<string, boolean>);
  }

  /**
   * Update widget visibility preference
   */
  static async updatePreference(
    userId: string,
    role: string,
    widgetId: string,
    isVisible: boolean
  ): Promise<void> {
    const supabase = createClientSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('user_dashboard_preferences')
      .upsert({
        user_id: userId,
        role,
        widget_id: widgetId,
        is_visible: isVisible,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,role,widget_id'
      }) as { error: Error | null };

    if (error) {
      logger.error('dashboard/preferences', 'Failed to update preference', error);
      throw error;
    }
  }

  /**
   * Reset all preferences to default
   */
  static async resetPreferences(userId: string, role: string): Promise<void> {
    const supabase = createClientSupabaseClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('user_dashboard_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('role', role) as { error: Error | null };

    if (error) {
      logger.error('dashboard/preferences', 'Failed to reset preferences', error);
      throw error;
    }
  }
}
