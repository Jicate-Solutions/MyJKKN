'use client';

// ============================================
// /internships — Internships module landing hub
// ============================================
// Operational landing page for the internships module.
// Surfaces all 4 top-level sections as cards so users land somewhere coherent
// when they navigate to the bare /internships URL (previously 404'd).
//
// Sections wired into this hub:
//   Cycles, Preceptors, Sites, Vehicles
//
// Pattern: mirrors /cdc/page.tsx (Sprint 7 CDC landing).
// ============================================

import Link from 'next/link';
import {
  Calendar,
  Users,
  Building2,
  Car,
  ChevronRight,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
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

const INTERNSHIP_MODULES: ModuleCard[] = [
  {
    href: '/internships/cycles',
    title: 'Cycles',
    description: 'Internship cycle calendars — semester batches, start/end dates, eligible cohorts.',
    icon: Calendar,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    href: '/internships/preceptors',
    title: 'Preceptors',
    description: 'Preceptor and industry-mentor roster. Specialisations, host-site assignments, availability.',
    icon: Users,
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    href: '/internships/sites',
    title: 'Sites',
    description: 'Host company and placement site directory. Sector tags, capacity, MoU status.',
    icon: Building2,
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    href: '/internships/vehicles',
    title: 'Vehicles',
    description: 'Transport assets for learner travel to internship sites — buses, vans, schedules.',
    icon: Car,
    color: 'text-orange-600 bg-orange-50',
  },
];

export default function InternshipsLandingPage() {
  return (
    <ContentLayout title="Internships">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Internships</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Internships Operations</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cycles, preceptors, host sites, and transport for learner internships across JKKN
            institutions.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {INTERNSHIP_MODULES.map((mod) => {
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
  );
}
