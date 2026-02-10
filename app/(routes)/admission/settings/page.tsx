'use client';

import { useState, useEffect } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Settings,
  MessageCircle,
  Mail,
  Phone,
  Clock,
  Shield,
  Bell,
  Save,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Types
interface ChannelFrequencyConfig {
  enabled: boolean;
  maxPerDay: number;
  maxPerWeek: number;
  cooldownMinutes: number;
  allowedHoursStart: number;
  allowedHoursEnd: number;
  weekendEnabled: boolean;
}

interface FrequencySettings {
  whatsapp: ChannelFrequencyConfig;
  sms: ChannelFrequencyConfig;
  email: ChannelFrequencyConfig;
  globalDailyLimit: number;
  globalWeeklyLimit: number;
  enforceQuietHours: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  blockDuplicateContent: boolean;
  minContentInterval: number;
}

// Default settings
const DEFAULT_SETTINGS: FrequencySettings = {
  whatsapp: {
    enabled: true,
    maxPerDay: 5,
    maxPerWeek: 20,
    cooldownMinutes: 60,
    allowedHoursStart: 9,
    allowedHoursEnd: 18,
    weekendEnabled: false
  },
  sms: {
    enabled: true,
    maxPerDay: 3,
    maxPerWeek: 15,
    cooldownMinutes: 120,
    allowedHoursStart: 9,
    allowedHoursEnd: 18,
    weekendEnabled: false
  },
  email: {
    enabled: true,
    maxPerDay: 10,
    maxPerWeek: 50,
    cooldownMinutes: 30,
    allowedHoursStart: 8,
    allowedHoursEnd: 20,
    weekendEnabled: true
  },
  globalDailyLimit: 15,
  globalWeeklyLimit: 70,
  enforceQuietHours: true,
  quietHoursStart: 21,
  quietHoursEnd: 8,
  blockDuplicateContent: true,
  minContentInterval: 24
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`
}));

function ChannelConfig({
  channel,
  icon: Icon,
  config,
  onChange
}: {
  channel: string;
  icon: React.ElementType;
  config: ChannelFrequencyConfig;
  onChange: (key: keyof ChannelFrequencyConfig, value: any) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{channel}</CardTitle>
              <CardDescription>Configure frequency limits for {channel.toLowerCase()} messages</CardDescription>
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(checked) => onChange('enabled', checked)}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={!config.enabled ? 'opacity-50 pointer-events-none' : ''}>
          {/* Message Limits */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label>Max Messages Per Day</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={config.maxPerDay}
                onChange={(e) => onChange('maxPerDay', parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Per lead per day</p>
            </div>
            <div className="space-y-2">
              <Label>Max Messages Per Week</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={config.maxPerWeek}
                onChange={(e) => onChange('maxPerWeek', parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">Per lead per week</p>
            </div>
          </div>

          {/* Cooldown */}
          <div className="space-y-2 mb-6">
            <Label>Cooldown Period (minutes)</Label>
            <Input
              type="number"
              min={0}
              max={1440}
              value={config.cooldownMinutes}
              onChange={(e) => onChange('cooldownMinutes', parseInt(e.target.value) || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Minimum time between messages to the same lead
            </p>
          </div>

          {/* Allowed Hours */}
          <div className="space-y-2 mb-6">
            <Label>Allowed Sending Hours</Label>
            <div className="flex items-center gap-2">
              <Select
                value={config.allowedHoursStart.toString()}
                onValueChange={(v) => onChange('allowedHoursStart', parseInt(v))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">to</span>
              <Select
                value={config.allowedHoursEnd.toString()}
                onValueChange={(v) => onChange('allowedHoursEnd', parseInt(v))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weekend */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Weekend Messages</Label>
              <p className="text-xs text-muted-foreground">
                Enable sending on Saturday and Sunday
              </p>
            </div>
            <Switch
              checked={config.weekendEnabled}
              onCheckedChange={(checked) => onChange('weekendEnabled', checked)}
            />
          </div>
        </div>

        {!config.enabled && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            <span>This channel is disabled. No messages will be sent via {channel.toLowerCase()}.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdmissionSettingsPageContent() {
  const { profile, isLoading: accessLoading } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const [settings, setSettings] = useState<FrequencySettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Load settings from admission_workflow_configs on mount
  useEffect(() => {
    if (!selectedInstitutionId) return;
    const loadSettings = async () => {
      setIsLoadingSettings(true);
      try {
        const supabase = createClientSupabaseClient();
        const { data, error } = await (supabase as any)
          .from('admission_workflow_configs')
          .select('sla_config')
          .eq('institution_id', selectedInstitutionId)
          .eq('config_name', 'frequency_settings')
          .maybeSingle();
        if (error) throw error;
        if (data?.sla_config) {
          const saved = typeof data.sla_config === 'string' ? JSON.parse(data.sla_config) : data.sla_config;
          setSettings({ ...DEFAULT_SETTINGS, ...saved });
        }
      } catch {
        // Use defaults if no saved settings found
      } finally {
        setIsLoadingSettings(false);
      }
    };
    loadSettings();
  }, [selectedInstitutionId]);

  const updateChannelConfig = (
    channel: 'whatsapp' | 'sms' | 'email',
    key: keyof ChannelFrequencyConfig,
    value: any
  ) => {
    setSettings((prev) => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [key]: value
      }
    }));
    setHasChanges(true);
  };

  const updateGlobalSetting = (key: keyof FrequencySettings, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedInstitutionId) {
      toast.error('Institution not found');
      return;
    }
    setIsSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await (supabase as any)
        .from('admission_workflow_configs')
        .upsert({
          institution_id: selectedInstitutionId,
          config_name: 'frequency_settings',
          sla_config: settings,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'institution_id,config_name' });
      if (error) throw error;
      toast.success('Settings saved successfully');
      setHasChanges(false);
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasChanges(true);
    toast.info('Settings reset to defaults');
  };

  // Calculate totals for summary
  const totalDailyLimit = settings.whatsapp.maxPerDay + settings.sms.maxPerDay + settings.email.maxPerDay;
  const totalWeeklyLimit = settings.whatsapp.maxPerWeek + settings.sms.maxPerWeek + settings.email.maxPerWeek;

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Admission Settings">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Settings</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset}>
                Reset to Defaults
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>

          {/* Page Title */}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6" />
              Message Frequency Controls
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure limits and schedules for automated lead communication
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Daily Limit</p>
                    <p className="text-2xl font-bold">{settings.globalDailyLimit}</p>
                    <p className="text-xs text-muted-foreground">msgs/lead/day</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Weekly Limit</p>
                    <p className="text-2xl font-bold">{settings.globalWeeklyLimit}</p>
                    <p className="text-xs text-muted-foreground">msgs/lead/week</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Quiet Hours</p>
                    <p className="text-2xl font-bold">
                      {settings.enforceQuietHours ? 'On' : 'Off'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {settings.quietHoursStart}:00 - {settings.quietHoursEnd}:00
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Spam Protection</p>
                    <p className="text-2xl font-bold">
                      {settings.blockDuplicateContent ? 'On' : 'Off'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {settings.minContentInterval}h interval
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="channels" className="space-y-6">
            <TabsList>
              <TabsTrigger value="channels">Channel Settings</TabsTrigger>
              <TabsTrigger value="global">Global Rules</TabsTrigger>
              <TabsTrigger value="protection">Spam Protection</TabsTrigger>
            </TabsList>

            {/* Channel Settings */}
            <TabsContent value="channels" className="space-y-6">
              <ChannelConfig
                channel="WhatsApp"
                icon={MessageCircle}
                config={settings.whatsapp}
                onChange={(key, value) => updateChannelConfig('whatsapp', key, value)}
              />
              <ChannelConfig
                channel="SMS"
                icon={Phone}
                config={settings.sms}
                onChange={(key, value) => updateChannelConfig('sms', key, value)}
              />
              <ChannelConfig
                channel="Email"
                icon={Mail}
                config={settings.email}
                onChange={(key, value) => updateChannelConfig('email', key, value)}
              />
            </TabsContent>

            {/* Global Rules */}
            <TabsContent value="global" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Global Message Limits</CardTitle>
                  <CardDescription>
                    Set overall limits across all communication channels
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Global Daily Limit</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={settings.globalDailyLimit}
                        onChange={(e) =>
                          updateGlobalSetting('globalDailyLimit', parseInt(e.target.value) || 1)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Max total messages per lead per day (all channels combined)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Global Weekly Limit</Label>
                      <Input
                        type="number"
                        min={1}
                        max={500}
                        value={settings.globalWeeklyLimit}
                        onChange={(e) =>
                          updateGlobalSetting('globalWeeklyLimit', parseInt(e.target.value) || 1)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Max total messages per lead per week (all channels combined)
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Channel Summary */}
                  <div>
                    <Label className="mb-3 block">Channel Limits Summary</Label>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg border bg-muted/50">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageCircle className="h-4 w-4 text-green-600" />
                          <span className="font-medium">WhatsApp</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {settings.whatsapp.maxPerDay}/day, {settings.whatsapp.maxPerWeek}/week
                        </p>
                      </div>
                      <div className="p-4 rounded-lg border bg-muted/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Phone className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">SMS</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {settings.sms.maxPerDay}/day, {settings.sms.maxPerWeek}/week
                        </p>
                      </div>
                      <div className="p-4 rounded-lg border bg-muted/50">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="h-4 w-4 text-purple-600" />
                          <span className="font-medium">Email</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {settings.email.maxPerDay}/day, {settings.email.maxPerWeek}/week
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-start gap-2">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-700 dark:text-blue-400">
                        <p className="font-medium">Combined Channel Totals:</p>
                        <p>Daily: {totalDailyLimit} messages | Weekly: {totalWeeklyLimit} messages</p>
                        <p className="text-xs mt-1">
                          Global limits override channel limits when they are lower.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quiet Hours</CardTitle>
                  <CardDescription>
                    Prevent messages from being sent during specific hours
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Enforce Quiet Hours</Label>
                      <p className="text-xs text-muted-foreground">
                        Block all automated messages during quiet hours
                      </p>
                    </div>
                    <Switch
                      checked={settings.enforceQuietHours}
                      onCheckedChange={(checked) =>
                        updateGlobalSetting('enforceQuietHours', checked)
                      }
                    />
                  </div>

                  <div className={!settings.enforceQuietHours ? 'opacity-50 pointer-events-none' : ''}>
                    <Label className="mb-2 block">Quiet Hours Period</Label>
                    <div className="flex items-center gap-2">
                      <Select
                        value={settings.quietHoursStart.toString()}
                        onValueChange={(v) => updateGlobalSetting('quietHoursStart', parseInt(v))}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOUR_OPTIONS.map((h) => (
                            <SelectItem key={h.value} value={h.value}>
                              {h.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">to</span>
                      <Select
                        value={settings.quietHoursEnd.toString()}
                        onValueChange={(v) => updateGlobalSetting('quietHoursEnd', parseInt(v))}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {HOUR_OPTIONS.map((h) => (
                            <SelectItem key={h.value} value={h.value}>
                              {h.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Messages scheduled during quiet hours will be queued for the next available time
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Spam Protection */}
            <TabsContent value="protection" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Duplicate Content Protection</CardTitle>
                  <CardDescription>
                    Prevent sending identical messages to the same lead
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Block Duplicate Content</Label>
                      <p className="text-xs text-muted-foreground">
                        Prevent sending the same message content within a time period
                      </p>
                    </div>
                    <Switch
                      checked={settings.blockDuplicateContent}
                      onCheckedChange={(checked) =>
                        updateGlobalSetting('blockDuplicateContent', checked)
                      }
                    />
                  </div>

                  <div
                    className={!settings.blockDuplicateContent ? 'opacity-50 pointer-events-none' : ''}
                  >
                    <div className="space-y-2">
                      <Label>Minimum Content Interval (hours)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={168}
                        value={settings.minContentInterval}
                        onChange={(e) =>
                          updateGlobalSetting('minContentInterval', parseInt(e.target.value) || 1)
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Same message content cannot be sent to the same lead within this period
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Protection Status</CardTitle>
                  <CardDescription>
                    Current protection features and their status
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">Daily Limit Protection</p>
                          <p className="text-xs text-muted-foreground">
                            Max {settings.globalDailyLimit} messages per lead per day
                          </p>
                        </div>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">Weekly Limit Protection</p>
                          <p className="text-xs text-muted-foreground">
                            Max {settings.globalWeeklyLimit} messages per lead per week
                          </p>
                        </div>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        {settings.enforceQuietHours ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        )}
                        <div>
                          <p className="font-medium">Quiet Hours</p>
                          <p className="text-xs text-muted-foreground">
                            {settings.enforceQuietHours
                              ? `No messages ${settings.quietHoursStart}:00 - ${settings.quietHoursEnd}:00`
                              : 'Messages can be sent 24/7'}
                          </p>
                        </div>
                      </div>
                      <Badge variant={settings.enforceQuietHours ? 'default' : 'secondary'}>
                        {settings.enforceQuietHours ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        {settings.blockDuplicateContent ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-amber-600" />
                        )}
                        <div>
                          <p className="font-medium">Duplicate Content Blocking</p>
                          <p className="text-xs text-muted-foreground">
                            {settings.blockDuplicateContent
                              ? `${settings.minContentInterval}h interval between same content`
                              : 'Same content can be sent repeatedly'}
                          </p>
                        </div>
                      </div>
                      <Badge variant={settings.blockDuplicateContent ? 'default' : 'secondary'}>
                        {settings.blockDuplicateContent ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Save Reminder */}
          {hasChanges && (
            <div className="fixed bottom-4 right-4 p-4 bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700 rounded-lg shadow-lg flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                You have unsaved changes
              </span>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Now'}
              </Button>
            </div>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function AdmissionSettingsPage() {
  return (
    <AdmissionErrorBoundary>
      <AdmissionSettingsPageContent />
    </AdmissionErrorBoundary>
  );
}
