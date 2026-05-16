'use client';

import React, { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useEmailNotificationPreferences,
  useUpdateEmailNotificationPreferences,
} from '@/hooks/use-email-notifications';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2 } from 'lucide-react';

interface EmailPreferencesProps {
  institutionsId: string;
}

export function EmailPreferences({ institutionsId }: EmailPreferencesProps) {
  const { profile } = useAuth();
  const { data: preferences, isLoading } = useEmailNotificationPreferences(
    profile?.id,
    institutionsId
  );
  const updatePrefs = useUpdateEmailNotificationPreferences();

  const [local, setLocal] = useState(preferences);
  const [showSuccess, setShowSuccess] = useState(false);

  // Update local state when preferences load
  React.useEffect(() => {
    setLocal(preferences);
  }, [preferences]);

  const handleToggle = (key: string) => {
    setLocal((prev: any) => ({
      ...prev,
      [key]: !prev?.[key],
    }));
  };

  const handleFrequencyChange = (value: string) => {
    setLocal((prev: any) => ({
      ...prev,
      email_frequency: value,
    }));
  };

  const handleSave = async () => {
    try {
      await updatePrefs.mutateAsync({
        userId: profile?.id || '',
        institutionsId,
        preferences: local,
      });

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Notifications</CardTitle>
        <CardDescription>
          Choose which Board of Studies events trigger email notifications
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {showSuccess && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Preferences saved successfully
            </AlertDescription>
          </Alert>
        )}

        {/* Notification Type Toggles */}
        <div className="space-y-4">
          <h3 className="font-semibold text-base">Notification Types</h3>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={local?.syllabi_revised ?? true}
                onCheckedChange={() => handleToggle('syllabi_revised')}
              />
              <div className="flex-1">
                <p className="font-medium text-sm">Syllabus Revisions</p>
                <p className="text-xs text-muted-foreground">
                  Notified when a course syllabus is revised
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={local?.syllabi_approved ?? true}
                onCheckedChange={() => handleToggle('syllabi_approved')}
              />
              <div className="flex-1">
                <p className="font-medium text-sm">Syllabus Approvals</p>
                <p className="text-xs text-muted-foreground">
                  Notified when a syllabus is approved by the board
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={local?.meeting_scheduled ?? true}
                onCheckedChange={() => handleToggle('meeting_scheduled')}
              />
              <div className="flex-1">
                <p className="font-medium text-sm">Meeting Scheduled</p>
                <p className="text-xs text-muted-foreground">
                  Notified when a Board of Studies meeting is scheduled
                </p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={local?.course_ready_review ?? true}
                onCheckedChange={() => handleToggle('course_ready_review')}
              />
              <div className="flex-1">
                <p className="font-medium text-sm">Course Ready for Review</p>
                <p className="text-xs text-muted-foreground">
                  Notified when a course is ready for review
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Email Frequency */}
        <div className="space-y-3">
          <Label htmlFor="frequency" className="text-base font-semibold">
            Email Frequency
          </Label>
          <Select
            value={local?.email_frequency ?? 'immediate'}
            onValueChange={handleFrequencyChange}
          >
            <SelectTrigger id="frequency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="immediate">
                <div>
                  <p className="font-medium">Immediate</p>
                  <p className="text-xs text-muted-foreground">
                    Receive emails as events happen
                  </p>
                </div>
              </SelectItem>
              <SelectItem value="daily_digest">
                <div>
                  <p className="font-medium">Daily Digest</p>
                  <p className="text-xs text-muted-foreground">
                    Receive one email per day with all events
                  </p>
                </div>
              </SelectItem>
              <SelectItem value="weekly_digest">
                <div>
                  <p className="font-medium">Weekly Digest</p>
                  <p className="text-xs text-muted-foreground">
                    Receive one email per week with all events
                  </p>
                </div>
              </SelectItem>
              <SelectItem value="never">
                <div>
                  <p className="font-medium">Never</p>
                  <p className="text-xs text-muted-foreground">
                    No email notifications
                  </p>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={updatePrefs.isPending}
          className="w-full"
        >
          {updatePrefs.isPending ? 'Saving...' : 'Save Preferences'}
        </Button>
      </CardContent>
    </Card>
  );
}
