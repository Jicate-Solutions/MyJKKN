'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/use-auth';
import toast from 'react-hot-toast';
import { Save, Loader2, Settings, IndianRupee, Clock, Bell, Target } from 'lucide-react';

// ── Settings Form ─────────────────────────────────────────────────────────────

interface VACSettings {
  default_fee: number;
  enrollment_expiry_days: number;
  auto_complete_on_all_lessons: boolean;
  case_enforcement_days: number;
  notify_on_enrollment: boolean;
  notify_on_completion: boolean;
  notify_at_risk_learners: boolean;
  notify_coordinators: boolean;
}

const DEFAULT_SETTINGS: VACSettings = {
  default_fee: 0,
  enrollment_expiry_days: 365,
  auto_complete_on_all_lessons: true,
  case_enforcement_days: 90,
  notify_on_enrollment: true,
  notify_on_completion: true,
  notify_at_risk_learners: true,
  notify_coordinators: true,
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function VACSettingsPage() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<VACSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  const updateSetting = <K extends keyof VACSettings>(
    key: K,
    value: VACSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // TODO: Implement settings persistence via API
      await new Promise((resolve) => setTimeout(resolve, 500));
      toast.success('Settings saved successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ContentLayout title="VAC Settings">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac">VAC</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/vac/admin">Admin</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold">Module Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure defaults and preferences for the VAC module
          </p>
        </div>

        {/* Course Defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4" />
              Course Defaults
            </CardTitle>
            <CardDescription>
              Default values applied when creating new courses
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="default_fee">Default Fee (INR)</Label>
                <Input
                  id="default_fee"
                  type="number"
                  min={0}
                  value={settings.default_fee}
                  onChange={(e) =>
                    updateSetting('default_fee', Number(e.target.value))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Set to 0 for free courses by default
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enrollment Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Enrollment Settings
            </CardTitle>
            <CardDescription>
              Control enrollment behavior and auto-completion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiry_days">Enrollment Expiry (Days)</Label>
                <Input
                  id="expiry_days"
                  type="number"
                  min={0}
                  value={settings.enrollment_expiry_days}
                  onChange={(e) =>
                    updateSetting(
                      'enrollment_expiry_days',
                      Number(e.target.value)
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Days before an enrollment expires. Set 0 for no expiry.
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Auto-complete on all lessons done</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically mark enrollment as completed when all lessons are
                  finished
                </p>
              </div>
              <Switch
                checked={settings.auto_complete_on_all_lessons}
                onCheckedChange={(v) =>
                  updateSetting('auto_complete_on_all_lessons', v)
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* CASE Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4" />
              CASE Graduation Tracker
            </CardTitle>
            <CardDescription>
              Configure CASE enforcement and tracking behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="enforcement_days">
                  Enforcement Days Before Exam
                </Label>
                <Input
                  id="enforcement_days"
                  type="number"
                  min={0}
                  value={settings.case_enforcement_days}
                  onChange={(e) =>
                    updateSetting(
                      'case_enforcement_days',
                      Number(e.target.value)
                    )
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Days before exam when CASE alerts escalate
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
            <CardDescription>
              Control which notifications are sent
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Enrollment notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Notify learners when they are enrolled in a course
                </p>
              </div>
              <Switch
                checked={settings.notify_on_enrollment}
                onCheckedChange={(v) =>
                  updateSetting('notify_on_enrollment', v)
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Completion notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Notify learners when they complete a course
                </p>
              </div>
              <Switch
                checked={settings.notify_on_completion}
                onCheckedChange={(v) =>
                  updateSetting('notify_on_completion', v)
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>At-risk learner alerts</Label>
                <p className="text-xs text-muted-foreground">
                  Send alerts to at-risk and critical learners
                </p>
              </div>
              <Switch
                checked={settings.notify_at_risk_learners}
                onCheckedChange={(v) =>
                  updateSetting('notify_at_risk_learners', v)
                }
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Coordinator notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Notify coordinators about at-risk learners and overdue tracks
                </p>
              </div>
              <Switch
                checked={settings.notify_coordinators}
                onCheckedChange={(v) =>
                  updateSetting('notify_coordinators', v)
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
