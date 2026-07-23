'use client';

// Hub landing for the post-class feedback module. Exists so
// /academic/session-feedback is a reachable URL (Hub Page Reachability gate —
// the hub-page-404 class). Role-agnostic: links each persona to their lane.

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, BarChart3, AlertTriangle } from 'lucide-react';

const LANES = [
  {
    href: '/learners/class-feedback',
    title: 'Give Learning Studio Feedback',
    who: 'Learners',
    desc: 'After each class, a 10-second checklist + “did I understand?” — submitting confirms your attendance. Also shows which sessions are confirmed vs still present-pending.',
    icon: MessageSquare,
  },
  {
    href: '/academic/session-feedback/faculty',
    title: 'Session Insight',
    who: 'Faculty',
    desc: 'Anonymized understanding signal across your own sessions.',
    icon: BarChart3,
  },
  {
    href: '/academic/session-feedback/principal',
    title: 'Session Escalations',
    who: 'Principal / HOD',
    desc: 'Sessions where learners reported low understanding, for follow-up.',
    icon: AlertTriangle,
  },
];

export default function SessionFeedbackHubPage() {
  return (
    <ContentLayout title="Session Feedback">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Academic', href: '/academic' },
          { label: 'Session Feedback' },
        ]}
      />
      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
            Session Feedback
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Post-class feedback that confirms attendance and surfaces where learners need help.
            Pick your view below.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {LANES.map((lane) => {
            const Icon = lane.icon;
            return (
              <Link key={lane.href} href={lane.href} className="block focus:outline-none">
                <Card className="h-full bg-[#fbfbee]/30 dark:bg-card transition hover:border-[#0b6d41]/40 hover:shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-5 w-5" style={{ color: '#0b6d41' }} />
                      {lane.title}
                    </CardTitle>
                    <span className="text-xs font-medium text-muted-foreground">{lane.who}</span>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{lane.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </ContentLayout>
  );
}
