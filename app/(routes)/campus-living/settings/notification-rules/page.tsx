'use client';

/**
 * Notification Rules — /campus-living/settings/notification-rules
 *
 * STATUS 2026-04-24 (Agent D — settings real-save): Previous "Save Changes"
 * only showed a warning toast. Persistence is BLOCKED on a missing
 * `hostel_notification_rules` table — Agent D did NOT ship a half-wired
 * save because that would reintroduce the silent-failure bug.
 *
 * BLOCKED ON (Agent A / migrations track):
 *   CREATE TABLE hostel_notification_rules (
 *     id UUID PK,
 *     institution_id UUID NOT NULL REFERENCES institutions(id),
 *     category TEXT NOT NULL,            -- 'leave' | 'maintenance' | 'safety' | 'mess' | 'fees'
 *     event_key TEXT NOT NULL,           -- stable id per rule (e.g. 'leave_submitted')
 *     event_label TEXT NOT NULL,         -- display label
 *     channel_email BOOLEAN NOT NULL DEFAULT true,
 *     channel_sms BOOLEAN NOT NULL DEFAULT false,
 *     channel_push BOOLEAN NOT NULL DEFAULT true,
 *     is_active BOOLEAN NOT NULL DEFAULT true,
 *     updated_by UUID,
 *     created_at TIMESTAMPTZ DEFAULT now(),
 *     updated_at TIMESTAMPTZ DEFAULT now(),
 *     UNIQUE (institution_id, event_key)
 *   );
 *   -- + RLS (is_super_admin() OR is_admin() OR user_has_permission + role_has_institution_access)
 *   -- + seed 17 rows per institution matching the categories/events shown here
 *
 * Until then this page stays in PreviewBanner mode. The toggles are DISPLAY
 * ONLY. Save is disabled with an explicit "table missing" message.
 */

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { PreviewBanner } from '../../_components/preview-banner';

export default function NotificationRulesPage() {
  const notificationCategories = [
    {
      category: 'Leave Management',
      rules: [
        { name: 'Leave request submitted', email: true, sms: false, push: true },
        { name: 'Leave approved/rejected', email: true, sms: true, push: true },
        { name: 'Leave returning reminder', email: false, sms: true, push: true },
      ],
    },
    {
      category: 'Maintenance',
      rules: [
        { name: 'New request created', email: true, sms: false, push: true },
        { name: 'Request assigned', email: true, sms: false, push: true },
        { name: 'Request resolved', email: true, sms: false, push: true },
        { name: 'SLA breach warning', email: true, sms: true, push: true },
      ],
    },
    {
      category: 'Safety',
      rules: [
        { name: 'Incident reported', email: true, sms: true, push: true },
        { name: 'Curfew violation', email: true, sms: true, push: true },
        { name: 'Unauthorized entry', email: true, sms: true, push: true },
      ],
    },
    {
      category: 'Mess',
      rules: [
        { name: 'Menu published', email: false, sms: false, push: true },
        { name: 'Meal opt-out approved', email: true, sms: false, push: true },
        { name: 'Low rating alert', email: true, sms: false, push: false },
      ],
    },
    {
      category: 'Fees',
      rules: [
        { name: 'Payment reminder', email: true, sms: true, push: true },
        { name: 'Payment received', email: true, sms: true, push: true },
        { name: 'Overdue notice', email: true, sms: true, push: true },
      ],
    },
  ];

  return (
    <ContentLayout title="Notification Rules">
      <div className="space-y-6">
        <PreviewBanner
          feature="notification rules"
          note="Blocked on missing table hostel_notification_rules. The Save button is disabled. Toggles below are display-only and will NOT persist. Agent A will ship the migration; this page will wire through once the table lands."
        />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notification Preferences</h1>
            <p className="text-muted-foreground">
              Configure which events trigger notifications and through which channels
            </p>
          </div>
          <Button
            disabled
            title="Disabled until hostel_notification_rules table ships"
          >
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>

        {notificationCategories.map((cat) => (
          <Card key={cat.category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                {cat.category}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Header */}
                <div className="grid grid-cols-4 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                  <div>Event</div>
                  <div className="flex items-center gap-1 justify-center"><Mail className="h-3 w-3" />Email</div>
                  <div className="flex items-center gap-1 justify-center"><MessageSquare className="h-3 w-3" />SMS</div>
                  <div className="flex items-center gap-1 justify-center"><Smartphone className="h-3 w-3" />Push</div>
                </div>
                {cat.rules.map((rule) => (
                  <div key={rule.name} className="grid grid-cols-4 gap-4 items-center">
                    <Label className="text-sm">{rule.name}</Label>
                    <div className="flex justify-center"><Switch defaultChecked={rule.email} disabled /></div>
                    <div className="flex justify-center"><Switch defaultChecked={rule.sms} disabled /></div>
                    <div className="flex justify-center"><Switch defaultChecked={rule.push} disabled /></div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ContentLayout>
  );
}
