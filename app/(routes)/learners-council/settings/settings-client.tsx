'use client';

/**
 * LC Settings Client - Notification preference toggles
 */

import { useState, useTransition } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Megaphone,
  CalendarCheck,
  ClipboardSignature,
  MessageSquare,
  AtSign,
  AlertTriangle,
  Save,
  Loader2,
  Check
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { NotificationType } from '@/types/learners-council';

interface NotificationPref {
  notification_type: NotificationType;
  channel_in_app: boolean;
  channel_email: boolean;
  channel_push: boolean;
}

interface SettingsClientProps {
  userId: string;
  initialPreferences: NotificationPref[];
}

const NOTIFICATION_CATEGORIES: {
  type: NotificationType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
}[] = [
  {
    type: 'announcement',
    label: 'Announcements',
    description: 'New LC announcements and circulars',
    icon: Megaphone,
    color: 'text-purple-600'
  },
  {
    type: 'event',
    label: 'Events',
    description: 'Event updates, reminders, and registrations',
    icon: CalendarCheck,
    color: 'text-green-600'
  },
  {
    type: 'od_approval',
    label: 'OD Approvals',
    description: 'OD request status changes and approvals',
    icon: ClipboardSignature,
    color: 'text-orange-600'
  },
  {
    type: 'chat',
    label: 'Chat Messages',
    description: 'Direct and group chat notifications',
    icon: MessageSquare,
    color: 'text-blue-600'
  },
  {
    type: 'poll',
    label: 'Polls',
    description: 'New polls and poll results',
    icon: AtSign,
    color: 'text-indigo-600'
  },
  {
    type: 'issue',
    label: 'Issues',
    description: 'Issue assignments and status updates',
    icon: AlertTriangle,
    color: 'text-red-600'
  }
];

export function SettingsClient({ userId, initialPreferences }: SettingsClientProps) {
  const [preferences, setPreferences] = useState<Record<NotificationType, NotificationPref>>(() => {
    const prefMap: Record<string, NotificationPref> = {};
    for (const cat of NOTIFICATION_CATEGORIES) {
      const existing = initialPreferences.find((p) => p.notification_type === cat.type);
      prefMap[cat.type] = existing || {
        notification_type: cat.type,
        channel_in_app: true,
        channel_email: true,
        channel_push: false
      };
    }
    return prefMap as Record<NotificationType, NotificationPref>;
  });

  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const togglePref = (type: NotificationType, channel: 'channel_in_app' | 'channel_email' | 'channel_push') => {
    setPreferences((prev) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [channel]: !prev[type][channel]
      }
    }));
    setSaved(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      const supabase = createClient();

      for (const [type, pref] of Object.entries(preferences)) {
        await supabase
          .from('lc_notification_preferences')
          .upsert(
            {
              user_id: userId,
              notification_type: type,
              channel_in_app: pref.channel_in_app,
              channel_email: pref.channel_email,
              channel_push: pref.channel_push,
              updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id,notification_type' }
          );
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose which notifications you want to receive and how
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Header Row */}
          <div className="grid grid-cols-[1fr_80px_80px_80px] gap-4 mb-4 pb-2 border-b">
            <div className="text-sm font-medium text-muted-foreground">Category</div>
            <div className="text-sm font-medium text-muted-foreground text-center">In-App</div>
            <div className="text-sm font-medium text-muted-foreground text-center">Email</div>
            <div className="text-sm font-medium text-muted-foreground text-center">Push</div>
          </div>

          {/* Preference Rows */}
          <div className="space-y-4">
            {NOTIFICATION_CATEGORIES.map((cat) => {
              const pref = preferences[cat.type];
              const Icon = cat.icon;

              return (
                <div key={cat.type} className="grid grid-cols-[1fr_80px_80px_80px] gap-4 items-center">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                      <Icon className={`h-4 w-4 ${cat.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{cat.label}</p>
                      <p className="text-xs text-muted-foreground hidden sm:block">{cat.description}</p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={pref.channel_in_app}
                      onCheckedChange={() => togglePref(cat.type, 'channel_in_app')}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={pref.channel_email}
                      onCheckedChange={() => togglePref(cat.type, 'channel_email')}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      checked={pref.channel_push}
                      onCheckedChange={() => togglePref(cat.type, 'channel_push')}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t">
            {saved && (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <Check className="h-3 w-3 mr-1" />
                Saved
              </Badge>
            )}
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
