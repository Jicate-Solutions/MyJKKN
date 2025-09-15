import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { UserAppFavorite, FavoriteApp } from '@/types/favorites';

export class FavoritesService {
  private static supabase = createClientSupabaseClient();

  /**
   * Add an application to user's favorites
   */
  static async addFavorite(applicationId: string): Promise<UserAppFavorite> {
    const { data: user, error: userError } = await this.supabase.auth.getUser();

    if (userError || !user?.user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await this.supabase
      .from('user_app_favorites')
      .insert({
        user_id: user.user.id,
        application_id: applicationId
      })
      .select()
      .single();

    if (error) {
      // If it's a unique constraint violation, the app is already favorited
      if (error.code === '23505') {
        throw new Error('Application is already in favorites');
      }
      throw new Error(`Failed to add favorite: ${error.message}`);
    }

    return data;
  }

  /**
   * Remove an application from user's favorites
   */
  static async removeFavorite(applicationId: string): Promise<void> {
    const { data: user, error: userError } = await this.supabase.auth.getUser();

    if (userError || !user?.user) {
      throw new Error('User not authenticated');
    }

    const { error } = await this.supabase
      .from('user_app_favorites')
      .delete()
      .eq('user_id', user.user.id)
      .eq('application_id', applicationId);

    if (error) {
      throw new Error(`Failed to remove favorite: ${error.message}`);
    }
  }

  /**
   * Get all user's favorite applications with app details
   */
  static async getFavoriteApps(): Promise<FavoriteApp[]> {
    const { data: user, error: userError } = await this.supabase.auth.getUser();

    if (userError || !user?.user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await this.supabase
      .from('user_app_favorites')
      .select(`
        id,
        application_id,
        created_at,
        applications!inner (
          id,
          name,
          description,
          icon_path,
          url,
          category_id,
          subcategory_id,
          roles_access,
          display_order,
          is_active,
          integration_type,
          auth_method,
          tags,
          support_contact,
          supported_platforms,
          api_endpoints,
          application_type,
          data_sensitivity,
          screenshots,
          created_by,
          created_at,
          updated_at,
          uses_parent_auth,
          app_id,
          api_key_hash,
          allowed_redirect_uris,
          allowed_scopes,
          rate_limit_requests,
          rate_limit_window_minutes,
          last_auth_activity,
          auth_enabled_at,
          auth_enabled_by,
          categories (
            id,
            name,
            description
          )
        )
      `)
      .eq('user_id', user.user.id)
      .eq('applications.is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch favorites: ${error.message}`);
    }

    return data?.map((item: any) => ({
      id: item.applications.id,
      name: item.applications.name,
      url: item.applications.url,
      description: item.applications.description ?? null,
      category_id: item.applications.category_id,
      category: item.applications.categories ? {
        id: item.applications.categories.id,
        name: item.applications.categories.name,
        description: item.applications.categories.description ?? null
      } : undefined,
      subcategory_id: item.applications.subcategory_id ?? null,
      subcategory: undefined,
      roles_access: item.applications.roles_access || [],
      display_order: item.applications.display_order || 0,
      is_active: item.applications.is_active,
      integration_type: item.applications.integration_type || 'direct_link',
      auth_method: item.applications.auth_method || 'none',
      tags: item.applications.tags || [],
      support_contact: item.applications.support_contact ?? null,
      supported_platforms: item.applications.supported_platforms || 'web',
      api_endpoints: item.applications.api_endpoints || [],
      application_type: item.applications.application_type || 'external',
      data_sensitivity: item.applications.data_sensitivity || 'public',
      icon_path: item.applications.icon_path ?? null,
      screenshots: item.applications.screenshots ?? null,
      created_by: item.applications.created_by,
      created_at: item.applications.created_at,
      updated_at: item.applications.updated_at,
      uses_parent_auth: item.applications.uses_parent_auth,
      app_id: item.applications.app_id ?? null,
      api_key_hash: item.applications.api_key_hash ?? null,
      allowed_redirect_uris: item.applications.allowed_redirect_uris ?? null,
      allowed_scopes: item.applications.allowed_scopes ?? null,
      rate_limit_requests: item.applications.rate_limit_requests,
      rate_limit_window_minutes: item.applications.rate_limit_window_minutes,
      last_auth_activity: item.applications.last_auth_activity ?? null,
      auth_enabled_at: item.applications.auth_enabled_at ?? null,
      auth_enabled_by: item.applications.auth_enabled_by ?? null,
      favorited_at: item.created_at
    })) || [];
  }

  /**
   * Get list of user's favorite application IDs
   */
  static async getFavoriteIds(): Promise<string[]> {
    const { data: user, error: userError } = await this.supabase.auth.getUser();

    if (userError || !user?.user) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('user_app_favorites')
      .select('application_id')
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Failed to fetch favorite IDs:', error);
      return [];
    }

    return data?.map(item => item.application_id) || [];
  }

  /**
   * Check if an application is favorited by the user
   */
  static async isFavorite(applicationId: string): Promise<boolean> {
    const { data: user, error: userError } = await this.supabase.auth.getUser();

    if (userError || !user?.user) {
      return false;
    }

    const { data, error } = await this.supabase
      .from('user_app_favorites')
      .select('id')
      .eq('user_id', user.user.id)
      .eq('application_id', applicationId)
      .single();

    if (error) {
      return false;
    }

    return !!data;
  }

  /**
   * Toggle favorite status for an application
   */
  static async toggleFavorite(applicationId: string): Promise<boolean> {
    const isFav = await this.isFavorite(applicationId);

    if (isFav) {
      await this.removeFavorite(applicationId);
      return false;
    } else {
      await this.addFavorite(applicationId);
      return true;
    }
  }

  /**
   * Get favorite count for a user
   */
  static async getFavoriteCount(): Promise<number> {
    const { data: user, error: userError } = await this.supabase.auth.getUser();

    if (userError || !user?.user) {
      return 0;
    }

    const { count, error } = await this.supabase
      .from('user_app_favorites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Failed to fetch favorite count:', error);
      return 0;
    }

    return count || 0;
  }
}