/**
 * LC Settings Page
 * Notification preferences and user settings for Learners Council
 */

import { createClient } from '@/lib/supabase/server';
import { getEnhancedUserProfile } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';
import { SettingsClient } from './settings-client';

export default async function LCSettingsPage() {
  const { profile } = await getEnhancedUserProfile();
  if (!profile) redirect('/');

  const supabase = await createClient();

  const { data: preferences } = await supabase
    .from('lc_notification_preferences')
    .select('notification_type, channel_in_app, channel_email, channel_push')
    .eq('user_id', profile.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          LC Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your Learners Council notification preferences
        </p>
      </div>

      <SettingsClient
        userId={profile.id}
        initialPreferences={preferences || []}
      />
    </div>
  );
}
