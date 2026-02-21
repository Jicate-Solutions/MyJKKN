'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Settings, IndianRupee, CalendarDays, Wrench, Bell, GitBranch, ArrowRight } from 'lucide-react';

export default function SettingsPage() {
  const settingsPages = [
    { title: 'General Settings', desc: 'Basic campus living configuration, academic year, hostel names', href: '/campus-living/settings/general', icon: Settings },
    { title: 'Fee Configuration', desc: 'Room-type fees, AC charges, deposit amounts, payment modes', href: '/campus-living/settings/fee-config', icon: IndianRupee },
    { title: 'Leave Types', desc: 'Configure leave types, max days, parent consent requirements', href: '/campus-living/settings/leave-types', icon: CalendarDays },
    { title: 'Maintenance SLA', desc: 'Set SLA targets by category and priority level', href: '/campus-living/settings/maintenance-sla', icon: Wrench },
    { title: 'Notification Rules', desc: 'Email, SMS, and push notification preferences', href: '/campus-living/settings/notification-rules', icon: Bell },
    { title: 'Approval Chains', desc: 'Configure approval workflows for leave, curfew, visitors', href: '/campus-living/settings/approval-chains', icon: GitBranch },
  ];

  return (
    <ContentLayout title="Settings">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Campus Living Settings</h1>
          <p className="text-muted-foreground">Configure rules, fees, SLAs, and operational settings</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {settingsPages.map((page) => (
            <Link key={page.href} href={page.href}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <page.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{page.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{page.desc}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </ContentLayout>
  );
}
