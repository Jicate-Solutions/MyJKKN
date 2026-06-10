'use client';

// ============================================
// /admission/counselors/admin — Counselor Admin landing hub
// ============================================
// Operational landing page for the admission counselors/admin configuration cluster.
// Surfaces the 5 sub-pages as cards so users land somewhere coherent
// when they navigate to the bare /admission/counselors/admin URL (previously 404'd).
//
// Sub-modules wired into this hub:
//   Alert Thresholds, Routing Config, Routing Errors, Rule Types, Tier Policy
//
// Pattern: mirrors /cdc/page.tsx (Sprint 7 CDC landing).
// ============================================

import Link from 'next/link';
import {
  AlertCircle,
  Workflow,
  AlertTriangle,
  ListChecks,
  Trophy,
  ChevronRight,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface ModuleCard {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

const COUNSELOR_ADMIN_MODULES: ModuleCard[] = [
  {
    href: '/admission/counselors/admin/alert-thresholds',
    title: 'Alert Thresholds',
    description: 'Configure when to flag a counselor’s queue — idle leads, overload, response-time breaches.',
    icon: AlertCircle,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    href: '/admission/counselors/admin/routing-config',
    title: 'Routing Config',
    description: 'Rules and policies that decide how incoming leads are auto-assigned to counselors.',
    icon: Workflow,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    href: '/admission/counselors/admin/routing-errors',
    title: 'Routing Errors',
    description: 'Leads that failed to route. Diagnose mis-matched rules, missing scopes, retry manually.',
    icon: AlertTriangle,
    color: 'text-rose-600 bg-rose-50',
  },
  {
    href: '/admission/counselors/admin/rule-types',
    title: 'Rule Types',
    description: 'Taxonomy of routing rules — by program, institution, language, tier, and custom predicates.',
    icon: ListChecks,
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    href: '/admission/counselors/admin/tier-policy',
    title: 'Tier Policy',
    description: 'Counselor tier definitions and quotas — seniority, lead-volume caps, escalation paths.',
    icon: Trophy,
    color: 'text-emerald-600 bg-emerald-50',
  },
];

export default function CounselorsAdminLandingPage() {
  return (
    <SuperAdminOnly
      fallback={
        <ContentLayout title="Counselors">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            This page is restricted to super administrators.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="Counselor Administration">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/admission">Admission</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Counselors</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Counselor Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Routing rules, tier policy, alert thresholds, and error triage for the admission
            counselor workforce.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {COUNSELOR_ADMIN_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className="block group"
                aria-label={`Open ${mod.title}`}
              >
                <Card className="h-full transition hover:shadow-md hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className={`p-2 rounded-lg ${mod.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition mt-2" />
                    </div>
                    <CardTitle className="text-base mt-3">{mod.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm">
                      {mod.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
