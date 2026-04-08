'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PhoneMissed,
  MessageSquare,
  MessageCircle,
  AlertTriangle,
  Loader2,
  Save,
  Info,
} from 'lucide-react';

// =============================================================================
// Types
// =============================================================================

interface CallSettings {
  institution_id: string;
  auto_whatsapp_enabled: boolean;
  auto_whatsapp_template: string | null;
  auto_sms_enabled: boolean;
  auto_sms_template: string | null;
  auto_sms_sender_id: string | null;
  dlt_entity_id: string | null;
  dlt_template_id: string | null;
}

interface MissedCallSettingsProps {
  institutionId: string;
}

// =============================================================================
// API functions
// =============================================================================

async function fetchCallSettings(
  institutionId: string
): Promise<CallSettings | null> {
  const res = await fetch(
    `/api/admission/settings/call-settings?institution_id=${institutionId}`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch call settings');
  }
  const json = await res.json();
  return json.data || null;
}

async function updateCallSettings(payload: {
  institution_id: string;
  auto_whatsapp_enabled: boolean;
  auto_whatsapp_template: string;
  auto_sms_enabled: boolean;
  auto_sms_template: string;
}): Promise<CallSettings> {
  const res = await fetch('/api/admission/settings/call-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save call settings');
  }
  const json = await res.json();
  return json.data;
}

// =============================================================================
// Component
// =============================================================================

export function MissedCallSettings({ institutionId }: MissedCallSettingsProps) {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['call-settings', institutionId],
    queryFn: () => fetchCallSettings(institutionId),
    enabled: !!institutionId,
  });

  // Local form state
  const [waEnabled, setWaEnabled] = useState(false);
  const [waTemplate, setWaTemplate] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [smsTemplate, setSmsTemplate] = useState('');

  // Sync from server data
  useEffect(() => {
    if (settings) {
      setWaEnabled(settings.auto_whatsapp_enabled ?? false);
      setWaTemplate(settings.auto_whatsapp_template ?? '');
      setSmsEnabled(settings.auto_sms_enabled ?? false);
      setSmsTemplate(settings.auto_sms_template ?? '');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateCallSettings({
        institution_id: institutionId,
        auto_whatsapp_enabled: waEnabled,
        auto_whatsapp_template: waTemplate,
        auto_sms_enabled: smsEnabled,
        auto_sms_template: smsTemplate,
      }),
    onSuccess: () => {
      toast.success('Missed call settings saved');
      queryClient.invalidateQueries({
        queryKey: ['call-settings', institutionId],
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Detect unsaved changes
  const hasChanges =
    settings !== undefined &&
    settings !== null &&
    (waEnabled !== (settings.auto_whatsapp_enabled ?? false) ||
      waTemplate !== (settings.auto_whatsapp_template ?? '') ||
      smsEnabled !== (settings.auto_sms_enabled ?? false) ||
      smsTemplate !== (settings.auto_sms_template ?? ''));

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96 mt-1" />
        </CardHeader>
        <CardContent className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneMissed className="h-5 w-5 text-orange-500" />
            Missed Call Auto-Reply
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No call settings configured for this institution. Contact admin to
            set up the call settings record.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PhoneMissed className="h-5 w-5 text-orange-500" />
          Missed Call Auto-Reply
        </CardTitle>
        <CardDescription>
          Automatically send a message to callers who don&apos;t get through.
          Applies to Exotel missed calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* ------------------------------------------------------------ */}
        {/* Section 1: WhatsApp Auto-Reply                                */}
        {/* ------------------------------------------------------------ */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-green-600" />
            <h3 className="font-medium">WhatsApp Auto-Reply for Missed Calls</h3>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="wa-toggle">Enable WhatsApp auto-reply</Label>
              <p className="text-xs text-muted-foreground">
                Send a WhatsApp message when a call is missed or unanswered
              </p>
            </div>
            <Switch
              id="wa-toggle"
              checked={waEnabled}
              onCheckedChange={setWaEnabled}
            />
          </div>

          {waEnabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="wa-template">Message template</Label>
                <Textarea
                  id="wa-template"
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  placeholder="Hi {{name}}, we noticed you tried to reach us. We'll call you back shortly..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Supports placeholders: {'{{name}}'}, {'{{phone}}'},{' '}
                  {'{{institution}}'}
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-blue-800 dark:text-blue-300">
                  <p className="font-medium">
                    {waEnabled ? 'Enabled' : 'Disabled'} — messages will be sent
                    to callers who don&apos;t get through
                  </p>
                  <p className="mt-1">
                    Messages are sent via WhatsApp Cloud API. 24-hour dedup
                    prevents duplicate messages to the same caller.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Section 2: SMS Auto-Reply                                     */}
        {/* ------------------------------------------------------------ */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-600" />
            <h3 className="font-medium">SMS Auto-Reply for Missed Calls</h3>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sms-toggle">Enable SMS auto-reply</Label>
              <p className="text-xs text-muted-foreground">
                Send an SMS fallback when a call is missed or unanswered
              </p>
            </div>
            <Switch
              id="sms-toggle"
              checked={smsEnabled}
              onCheckedChange={setSmsEnabled}
            />
          </div>

          {smsEnabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="sms-template">SMS template</Label>
                <Textarea
                  id="sms-template"
                  value={smsTemplate}
                  onChange={(e) => setSmsTemplate(e.target.value)}
                  placeholder="Hi {{name}}, you tried reaching JKKN. We'll call back soon. For queries visit jkkn.ac.in"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  SMS has a 160-character limit per segment. Keep it concise.
                </p>
              </div>

              {/* DLT Warning */}
              {!settings.dlt_template_id && (
                <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/30">
                  <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-yellow-800 dark:text-yellow-300">
                    <p className="font-medium">
                      DLT template ID not configured
                    </p>
                    <p className="mt-1">
                      SMS will be blocked by Indian telecom operators without a
                      registered DLT template. Contact admin to configure DLT
                      settings.
                    </p>
                  </div>
                </div>
              )}

              {/* DLT info (read-only) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    DLT Entity ID
                  </Label>
                  <p className="text-sm font-mono">
                    {settings.dlt_entity_id || (
                      <span className="text-muted-foreground italic">
                        Not set
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    DLT Template ID
                  </Label>
                  <p className="text-sm font-mono">
                    {settings.dlt_template_id || (
                      <span className="text-muted-foreground italic">
                        Not set
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ------------------------------------------------------------ */}
        {/* Save Button                                                   */}
        {/* ------------------------------------------------------------ */}
        <div className="flex items-center justify-between border-t pt-4">
          <div>
            {hasChanges && (
              <Badge variant="outline" className="text-xs text-orange-600">
                Unsaved changes
              </Badge>
            )}
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
