'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, UserPlus, Users, Inbox } from 'lucide-react';

const TILES = [
  {
    href: '/hr/recruitment/submit',
    label: 'Submit Candidate',
    icon: UserPlus,
    description: 'Propose a new hire — fills approval chain automatically based on role and Monthly Salary band',
  },
  {
    href: '/hr/recruitment/my',
    label: 'My Candidates',
    icon: Users,
    description: 'Track candidates you submitted — view status, withdraw if needed',
  },
  {
    href: '/hr/recruitment/approvals',
    label: 'Approvals',
    icon: Inbox,
    description: 'Review candidates awaiting your sign-off in the approval chain',
  },
];

export default function HRRecruitmentHubPage() {
  return (
    <ContentLayout title="HR Recruitment — Hub">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Recruitment</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Recruitment</h1>
          <p className="text-sm text-muted-foreground">
            Submit candidates, track approvals, and manage Salary negotiation — all driven by the HR approval flow rules.
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
          <CardHeader><CardTitle className="text-sm">How Recruitment Works Here</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>• <strong>Submit a candidate</strong> with their CVViz profile link and proposed Monthly Salary band</p>
            <p>• <strong>Approval chain auto-built</strong> from the HR policy flow rules (role category + Monthly Salary band)</p>
            <p>• <strong>Emergency flag</strong> routes the candidate faster, bypassing multi-step review</p>
            <p>• <strong>Salary negotiation</strong> tracked per candidate — proposals, counters, and approvals all logged</p>
            <p>• <strong>Internal transfers</strong> link back to the existing staff record for continuity</p>
            <p>• <strong>Frozen approval snapshot</strong> — edits to policy flows don&apos;t affect in-flight candidacies</p>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
