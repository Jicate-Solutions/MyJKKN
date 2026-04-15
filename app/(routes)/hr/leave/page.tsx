'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, CalendarDays, FileText, Inbox, Wallet, Banknote, CalendarRange } from 'lucide-react';

const TILES = [
  { href: '/hr/leave/apply',           label: 'Apply Leave',           icon: FileText,      description: 'Submit a new leave application with live balance check' },
  { href: '/hr/leave/my-applications', label: 'My Applications',       icon: CalendarDays,  description: 'View your leave history, withdraw or cancel' },
  { href: '/hr/leave/approve',         label: 'Approval Inbox',        icon: Inbox,         description: 'Pending applications in your approval chain' },
  { href: '/hr/leave/calendar',        label: 'Team Calendar',         icon: CalendarRange, description: 'Org-wide view of who is on leave' },
  { href: '/hr/leave/balance',         label: 'My Balance',            icon: Wallet,        description: 'Entitled, used, carried-forward per leave type' },
  { href: '/hr/leave/encashment',      label: 'Leave Encashment',      icon: Banknote,      description: 'Request year-end encashment of unused leave' },
];

export default function HRLeaveHubPage() {
  return (
    <ContentLayout title="HR Leave — Hub">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Leave</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Leave Management</h1>
          <p className="text-sm text-muted-foreground">
            Sprint 3 — apply / approve / track balance / view calendar. Driven by the policy catalog from Sprint 2.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {TILES.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className="border rounded-md p-4 hover:bg-muted/40 transition flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{t.description}</div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 mt-1 text-muted-foreground" />
              </Link>
            );
          })}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">How Leave Works Here</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>• <strong>Pro-rata entitlement</strong> from your date of joining (fiscal year Apr 1–Mar 31)</p>
            <p>• <strong>Skip weekends + holidays</strong> from balance by default (configurable per leave type)</p>
            <p>• <strong>Frozen approval snapshot</strong> — if HR edits the flow, in-flight apps keep original rules</p>
            <p>• <strong>Cancel after approval = new &quot;cancelled&quot; row</strong> with balance auto-restored</p>
            <p>• <strong>Emergency flag</strong> bypasses advance-notice + requires documents within 48h</p>
            <p>• <strong>Calendar shows &quot;On Leave&quot;</strong> without revealing leave type to peers</p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
