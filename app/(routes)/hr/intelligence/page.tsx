'use client';

/**
 * HR Intelligence — Super-Module Container
 *
 * Single route `/hr/intelligence` with tabbed sections.
 * Recruitment Need Signal is tab 1 of 15 Tier A features.
 * Remaining tabs render "Coming Soon" placeholders until built.
 *
 * Spec: specs/hr-recruitment-need-signal-2026-05-24.md
 * Decision: HR Intelligence super-module, single route with tabbed sections.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  Users,
  BarChart3,
  TrendingUp,
  Target,
  ShieldAlert,
  GraduationCap,
  Clock,
  Award,
  Briefcase,
  LineChart,
  PieChart,
  Zap,
  FileSearch,
  Building,
} from 'lucide-react';

const INTELLIGENCE_TABS = [
  { id: 'recruitment-need', label: 'Recruitment Need', icon: Users, ready: true },
  { id: 'workforce-planning', label: 'Workforce Planning', icon: TrendingUp, ready: false },
  { id: 'attrition-risk', label: 'Attrition Risk', icon: ShieldAlert, ready: false },
  { id: 'performance-insights', label: 'Performance', icon: Target, ready: false },
  { id: 'training-gaps', label: 'Training Gaps', icon: GraduationCap, ready: false },
  { id: 'workload-balance', label: 'Workload Balance', icon: Clock, ready: false },
  { id: 'compensation-intel', label: 'Compensation', icon: BarChart3, ready: false },
  { id: 'succession-planning', label: 'Succession', icon: Award, ready: false },
  { id: 'compliance-readiness', label: 'Compliance', icon: FileSearch, ready: false },
  { id: 'diversity-metrics', label: 'Diversity', icon: PieChart, ready: false },
  { id: 'engagement-pulse', label: 'Engagement', icon: Zap, ready: false },
  { id: 'recruitment-analytics', label: 'Recruitment Analytics', icon: Briefcase, ready: false },
  { id: 'bench-strength', label: 'Bench Strength', icon: LineChart, ready: false },
  { id: 'cross-institution', label: 'Cross-Institution', icon: Building, ready: false },
  { id: 'predictive-models', label: 'Predictive Models', icon: Brain, ready: false },
] as const;

export default function HRIntelligencePage() {
  const [activeTab, setActiveTab] = useState<string>('recruitment-need');

  return (
    <ContentLayout title="HR Intelligence">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Intelligence</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0">
            {INTELLIGENCE_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-1.5 px-3 py-1.5 text-xs"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {!tab.ready && (
                    <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                      Soon
                    </Badge>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="recruitment-need" className="mt-6">
            <RecruitmentNeedTab />
          </TabsContent>

          {INTELLIGENCE_TABS.filter((t) => !t.ready).map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              <ComingSoonPlaceholder label={tab.label} icon={tab.icon} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ContentLayout>
  );
}

function RecruitmentNeedTab() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Recruitment Need Signal
        </CardTitle>
        <CardDescription>
          Composite signal (0-100) from 7 inputs: sanctioned gap, SFR, specialization coverage,
          workload, projected intake, attrition pipeline, and peer benchmarks.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Brain className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-sm">Signal dashboard UI will render here.</p>
          <p className="text-xs mt-1 opacity-75">
            Hooks and service layer are ready — UI components coming in next PR.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ComingSoonPlaceholder({ label, icon: Icon }: { label: string; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Icon className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-sm font-medium">Coming Soon</p>
          <p className="text-xs mt-1 opacity-75">
            This intelligence module is planned for a future sprint.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
