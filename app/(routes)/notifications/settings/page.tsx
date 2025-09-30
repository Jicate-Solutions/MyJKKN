// app/(routes)/notifications/settings/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Settings, Save } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  useNotificationPreferences,
  useCreatePreference,
  useUpdatePreference
} from '@/hooks/notification/use-notifications';
import { useAuth } from '@/hooks/use-auth';
import {
  NotificationCategory,
  NotificationChannel
} from '@/types/notification';
import { useToast } from '@/hooks/use-toast';

export default function NotificationSettingsPage() {
  const { profile: user } = useAuth();
  const { toast } = useToast();
  const { data: preferences = [], isLoading } = useNotificationPreferences(
    user?.id
  );
  const createPreference = useCreatePreference();
  const updatePreference = useUpdatePreference();

  const [settings, setSettings] = useState<
    Record<
      NotificationCategory,
      {
        enabled: boolean;
        channels: NotificationChannel[];
        quietHoursStart: string;
        quietHoursEnd: string;
      }
    >
  >({
    [NotificationCategory.RESERVATION]: {
      enabled: true,
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      quietHoursStart: '',
      quietHoursEnd: ''
    },
    [NotificationCategory.APPROVAL]: {
      enabled: true,
      channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      quietHoursStart: '',
      quietHoursEnd: ''
    },
    [NotificationCategory.MAINTENANCE]: {
      enabled: true,
      channels: [NotificationChannel.IN_APP],
      quietHoursStart: '',
      quietHoursEnd: ''
    },
    [NotificationCategory.RESOURCE]: {
      enabled: true,
      channels: [NotificationChannel.IN_APP],
      quietHoursStart: '',
      quietHoursEnd: ''
    },
    [NotificationCategory.SYSTEM]: {
      enabled: true,
      channels: [NotificationChannel.IN_APP],
      quietHoursStart: '',
      quietHoursEnd: ''
    }
  });

  // Load preferences
  useEffect(() => {
    if (preferences.length > 0) {
      const newSettings = { ...settings };
      preferences.forEach((pref) => {
        newSettings[pref.category] = {
          enabled: pref.enabled,
          channels: pref.channels,
          quietHoursStart: pref.quiet_hours_start || '',
          quietHoursEnd: pref.quiet_hours_end || ''
        };
      });
      setSettings(newSettings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences]);

  const handleToggleCategory = (category: NotificationCategory) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        enabled: !prev[category].enabled
      }
    }));
  };

  const handleToggleChannel = (
    category: NotificationCategory,
    channel: NotificationChannel
  ) => {
    setSettings((prev) => {
      const currentChannels = prev[category].channels;
      const newChannels = currentChannels.includes(channel)
        ? currentChannels.filter((c) => c !== channel)
        : [...currentChannels, channel];

      return {
        ...prev,
        [category]: {
          ...prev[category],
          channels: newChannels
        }
      };
    });
  };

  const handleQuietHoursChange = (
    category: NotificationCategory,
    field: 'quietHoursStart' | 'quietHoursEnd',
    value: string
  ) => {
    setSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (!user?.id) return;

    try {
      for (const [category, setting] of Object.entries(settings)) {
        const existingPref = preferences.find((p) => p.category === category);

        const prefData = {
          user_id: user.id,
          category: category as NotificationCategory,
          channels:
            setting.channels.length > 0
              ? setting.channels
              : [NotificationChannel.IN_APP],
          enabled: setting.enabled,
          quiet_hours_start: setting.quietHoursStart || undefined,
          quiet_hours_end: setting.quietHoursEnd || undefined
        };

        if (existingPref) {
          await updatePreference.mutateAsync({
            id: existingPref.id,
            data: {
              channels: prefData.channels,
              enabled: prefData.enabled,
              quiet_hours_start: prefData.quiet_hours_start,
              quiet_hours_end: prefData.quiet_hours_end
            }
          });
        } else {
          await createPreference.mutateAsync(prefData);
        }
      }

      toast({
        title: 'Settings saved',
        description:
          'Your notification preferences have been updated successfully.'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save settings',
        variant: 'destructive'
      });
    }
  };

  const getCategoryLabel = (category: NotificationCategory) => {
    return (
      category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ')
    );
  };

  const getCategoryDescription = (category: NotificationCategory) => {
    const descriptions = {
      [NotificationCategory.RESERVATION]:
        'Notifications about your reservations and bookings',
      [NotificationCategory.APPROVAL]: 'Approval requests and status updates',
      [NotificationCategory.MAINTENANCE]: 'Maintenance schedules and reminders',
      [NotificationCategory.RESOURCE]:
        'Resource updates and availability changes',
      [NotificationCategory.SYSTEM]:
        'System announcements and important updates'
    };
    return descriptions[category];
  };

  return (
    <ContentLayout title='Notification Settings'>
      <Breadcrumb className='mb-6'>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href='/'>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href='/notifications'>Notifications</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage>Settings</BreadcrumbPage>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className='flex items-center justify-between mb-6'>
        <div>
          <h1 className='text-3xl font-bold flex items-center gap-2'>
            <Settings className='h-8 w-8' />
            Notification Settings
          </h1>
          <p className='text-muted-foreground'>
            Manage how you receive notifications
          </p>
        </div>
        <Button onClick={handleSave} disabled={isLoading}>
          <Save className='mr-2 h-4 w-4' />
          Save Changes
        </Button>
      </div>

      <div className='space-y-6'>
        {Object.values(NotificationCategory).map((category) => (
          <Card key={category}>
            <CardHeader>
              <div className='flex items-center justify-between'>
                <div>
                  <CardTitle>{getCategoryLabel(category)}</CardTitle>
                  <CardDescription>
                    {getCategoryDescription(category)}
                  </CardDescription>
                </div>
                <Switch
                  checked={settings[category].enabled}
                  onCheckedChange={() => handleToggleCategory(category)}
                />
              </div>
            </CardHeader>

            {settings[category].enabled && (
              <CardContent className='space-y-6'>
                {/* Channels */}
                <div className='space-y-3'>
                  <Label>Notification Channels</Label>
                  <div className='space-y-2'>
                    {Object.values(NotificationChannel).map((channel) => (
                      <div
                        key={channel}
                        className='flex items-center space-x-2'
                      >
                        <Checkbox
                          id={`${category}-${channel}`}
                          checked={settings[category].channels.includes(
                            channel
                          )}
                          onCheckedChange={() =>
                            handleToggleChannel(category, channel)
                          }
                        />
                        <label
                          htmlFor={`${category}-${channel}`}
                          className='text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 capitalize'
                        >
                          {channel.replace('_', ' ')}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Quiet Hours */}
                <div className='space-y-3'>
                  <Label>Quiet Hours (Optional)</Label>
                  <p className='text-sm text-muted-foreground'>
                    Mute notifications during specific hours
                  </p>
                  <div className='grid grid-cols-2 gap-4'>
                    <div className='space-y-2'>
                      <Label htmlFor={`${category}-start`}>Start Time</Label>
                      <Input
                        id={`${category}-start`}
                        type='time'
                        value={settings[category].quietHoursStart}
                        onChange={(e) =>
                          handleQuietHoursChange(
                            category,
                            'quietHoursStart',
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor={`${category}-end`}>End Time</Label>
                      <Input
                        id={`${category}-end`}
                        type='time'
                        value={settings[category].quietHoursEnd}
                        onChange={(e) =>
                          handleQuietHoursChange(
                            category,
                            'quietHoursEnd',
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </ContentLayout>
  );
}
