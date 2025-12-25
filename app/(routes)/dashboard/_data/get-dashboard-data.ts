'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * Get current user ID - NOT cached
 * This must run outside of cache scope to access cookies()
 */
async function getUserId(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  return user?.id || null;
}

/**
 * Get current user data for dashboard
 * Note: Cannot be cached because it uses cookies() via createServerSupabaseClient
 */
async function getCurrentUserCached(userId: string) {
  const supabase = await createServerSupabaseClient();

  // Get user profile
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    fullName: profileData?.full_name || user.email?.split('@')[0] || 'User'
  };
}

/**
 * Get current user - Wrapper function
 * Handles cookies outside of cache scope
 */
export async function getCurrentUser() {
  const userId = await getUserId();
  if (!userId) return null;
  return getCurrentUserCached(userId);
}

/**
 * Get dashboard configurations for current user
 * Note: Cannot be cached because it uses cookies() via createServerSupabaseClient
 */
async function getDashboardConfigurationsCached(userId: string) {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
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
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[dashboard] Error fetching configurations:', error);
    return [];
  }

  return data || [];
}

/**
 * Get dashboard configurations - Wrapper function
 * Handles cookies outside of cache scope
 */
export async function getDashboardConfigurations() {
  const userId = await getUserId();
  if (!userId) return [];
  return getDashboardConfigurationsCached(userId);
}

/**
 * Get available widget types
 * Note: Cannot be cached because it uses cookies() via createServerSupabaseClient
 */
export async function getAvailableWidgetTypes() {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('dashboard_widget_types')
    .select('*')
    .eq('is_active', true)
    .order('category')
    .order('widget_name');

  if (error) {
    console.error('[dashboard] Error fetching widget types:', error);
    return [];
  }

  return data || [];
}
