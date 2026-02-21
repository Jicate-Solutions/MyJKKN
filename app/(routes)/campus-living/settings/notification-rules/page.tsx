'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Save, Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';

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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notification Preferences</h1>
            <p className="text-muted-foreground">Configure which events trigger notifications and through which channels</p>
          </div>
          <Button><Save className="mr-2 h-4 w-4" />Save Changes</Button>
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
                    <div className="flex justify-center"><Switch defaultChecked={rule.email} /></div>
                    <div className="flex justify-center"><Switch defaultChecked={rule.sms} /></div>
                    <div className="flex justify-center"><Switch defaultChecked={rule.push} /></div>
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
