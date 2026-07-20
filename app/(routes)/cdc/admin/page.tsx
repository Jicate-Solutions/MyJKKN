'use client';

// ============================================
// /cdc/admin — CDC module admin landing
// ============================================
// Director-facing hub for all CDC configuration surfaces.
// Cards link to: policies, master tables, cron status.
// Pattern mirrors /internships/policy (Sprint 7a).
// ============================================

import Link from 'next/link';
import {
  Settings,
  ListChecks,
  Factory,
  Gift,
  GraduationCap,
  PresentationIcon,
  Building2,
  Users,
  Clock,
  ChevronRight,
  ShieldAlert,
  Activity,
  UserCog,
  Heart,
  Briefcase,
  Tags,
  BookOpen,
  Network,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCdcAdmin } from '@/hooks/cdc/use-cdc-admin';

interface AdminCard {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
  badge?: string;
  badgeVariant?: 'default' | 'secondary' | 'destructive' | 'outline';
  color: string;
}

const ADMIN_CARDS: AdminCard[] = [
  {
    href: '/cdc/admin/policies',
    title: 'CDC Policies',
    description: 'Configure drive lifecycle rules, eligibility thresholds, NAAC/AICTE export mappings, and escalation timers. Changes take effect immediately — no deploy.',
    icon: Settings,
    badge: '13 keys',
    badgeVariant: 'secondary',
    color: 'text-blue-600 bg-blue-50',
  },
  {
    href: '/cdc/admin/drive-types',
    title: 'Drive Types',
    description: 'Manage placement drive categories (On-Campus, Off-Campus, Pool, etc.). Controls which drive types coordinators can create.',
    icon: ListChecks,
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    href: '/cdc/admin/offer-types',
    title: 'Offer Types',
    description: 'Configure placement offer categories (Full-time, Internship, PPO, Apprenticeship). The "counts_toward_placement" flag affects NAAC statistics.',
    icon: Gift,
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    href: '/cdc/admin/training-types',
    title: 'Training Types',
    description: 'Manage training programme categories (Unnati, MRB, Springboard, etc.) used in the training module.',
    icon: GraduationCap,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    href: '/cdc/admin/workshop-types',
    title: 'Workshop Types',
    description: 'Configure workshop and seminar categories for career development activities.',
    icon: PresentationIcon,
    color: 'text-orange-600 bg-orange-50',
  },
  {
    href: '/cdc/admin/industry-sectors',
    title: 'Industry Sectors',
    description: 'Manage industry sector classifications (IT, Manufacturing, Healthcare, etc.) used to categorise recruiters.',
    icon: Factory,
    color: 'text-cyan-600 bg-cyan-50',
  },
  {
    href: '/cdc/admin/recruiters',
    title: 'Recruiter Directory',
    description: 'Full CRUD for the company/recruiter master. Manage contact details, package bands, and blacklist status.',
    icon: Building2,
    color: 'text-purple-600 bg-purple-50',
  },
  {
    href: '/cdc/admin/mentor-categories',
    title: 'Mentor Categories',
    description: 'How industry mentors engage (Guest Lecturer, Project Mentor, Placement Mentor, Advisory Board). Drives the required Engagement Category on the Add Industry Mentor form.',
    icon: UserCog,
    color: 'text-rose-600 bg-rose-50',
  },
  {
    href: '/cdc/admin/mentorship-categories',
    title: 'Mentorship Categories',
    description: 'The focus area of a mentorship (Academic, Career, Technical, Entrepreneurship). Drives the required Mentorship Category on the new-mentorship form.',
    icon: Heart,
    color: 'text-pink-600 bg-pink-50',
  },
  {
    href: '/cdc/admin/internship-types',
    title: 'Internship Types',
    description: 'The kinds of internship the CDC runs (Corporate, Clinical, Teaching Practice, Pharmacy Practice). Drives the required Type on the new-internship form.',
    icon: Briefcase,
    color: 'text-teal-600 bg-teal-50',
  },
  {
    href: '/cdc/admin/expertise-areas',
    title: 'Expertise Areas',
    description: 'The expertise tags available for industry mentors (AI/ML, Cloud, Finance, …). Curate freely — drives the Expertise Areas multi-select on the Add Industry Mentor form.',
    icon: Tags,
    color: 'text-violet-600 bg-violet-50',
  },
  {
    href: '/cdc/admin/exam-syllabus-topics',
    title: 'Exam Syllabus Topics',
    description: 'Government-exam syllabus topics for the Govt Job Readiness track. Mark topics "shared" (common across exams) or "domain-specific" — the cohort-overlap view derives its split from these flags (no percentage is hardcoded).',
    icon: BookOpen,
    color: 'text-lime-600 bg-lime-50',
  },
  {
    href: '/cdc/admin/exam-topic-map',
    title: 'Exam Topic Map',
    description: 'Map each government-exam type to the syllabus topics it covers. Toggle cells in a topic × exam matrix — this is what makes one coaching cohort provably serve multiple exams.',
    icon: Network,
    color: 'text-green-600 bg-green-50',
  },
  {
    href: '/cdc/admin/cron-status',
    title: 'Cron Status',
    description: 'Read-only view of the coordinator-escalation and placement-snapshot cron jobs — last run, status, and schedule.',
    icon: Clock,
    badge: 'Read-only',
    badgeVariant: 'outline',
    color: 'text-slate-600 bg-slate-50',
  },
];

export default function CdcAdminPage() {
  const { isCdcAdmin, isLoading } = useCdcAdmin();

  if (isLoading) {
    return (
      <ContentLayout title="CDC Admin">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </ContentLayout>
    );
  }

  if (!isCdcAdmin) {
    return (
      <ContentLayout title="CDC Admin">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>
            CDC admin configuration requires super-admin or CDC Head role.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="CDC Admin">
      <PageBreadcrumb
        items={[
          { label: 'CDC', href: '/cdc' },
          { label: 'Admin', href: '/cdc/admin' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Career Development Centre</h1>
        <p className="text-muted-foreground mt-1">
          Configure placement drives, master tables, policies, and monitor cron jobs.
        </p>
      </div>

      {/* Operational dashboard — featured link, separate from configuration cards (T1.3) */}
      <Link href="/cdc/admin/dashboard" className="group mb-6 block">
        <Card className="border-blue-200 bg-blue-50/40 transition-shadow group-hover:shadow-md dark:border-blue-900 dark:bg-blue-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                <Activity className="h-5 w-5" />
              </div>
              <Badge variant="default" className="text-xs">
                Live
              </Badge>
            </div>
            <CardTitle className="mt-2 flex items-center gap-1 text-base">
              Operational Dashboard
              <ChevronRight className="-ml-1 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-sm leading-relaxed">
              Live metrics across all 8 institutions — drives in flight, pending willingness,
              placements YTD, overdue coordinator items, top recruiters, and IDP submission rates.
              Auto-refreshes every 60 seconds.
            </CardDescription>
          </CardContent>
        </Card>
      </Link>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ADMIN_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className={`rounded-lg p-2 ${card.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    {card.badge && (
                      <Badge variant={card.badgeVariant ?? 'secondary'} className="text-xs">
                        {card.badge}
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="flex items-center gap-1 text-base mt-2">
                    {card.title}
                    <ChevronRight className="h-4 w-4 opacity-0 -ml-1 transition-opacity group-hover:opacity-60" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-sm leading-relaxed">
                    {card.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </ContentLayout>
  );
}
