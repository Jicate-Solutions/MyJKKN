'use client';

// ============================================
// /cdc — CDC module landing hub
// ============================================
// Operational landing page for the Career Development Centre module.
// Surfaces all 10 sub-modules as cards so users land somewhere coherent
// when they navigate to the bare /cdc URL (previously 404'd).
//
// Sub-modules wired into this hub:
//   Drives, Placements, Internships, IDP, Clubs, Mentor Pairings,
//   Training, Opportunities Bulletin, Exports, Industry Mentors
//
// Pattern: mirrors /cdc/admin/page.tsx (Sprint 7a admin landing).
// ============================================

import Link from 'next/link';
import {
  Briefcase,
  GraduationCap,
  Award,
  ClipboardList,
  Users2,
  UserCheck,
  PresentationIcon,
  Megaphone,
  FileDown,
  Factory,
  Compass,
  ChevronRight,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
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
  permModule: string;
}

const CDC_MODULES: ModuleCard[] = [
  {
    href: '/cdc/drives',
    title: 'Campus Drives',
    permModule: 'cdc.drives',
    description: 'Recruiter-led placement and internship drives. 7-state lifecycle, eligibility, willingness, attendance, results.',
    icon: Briefcase,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    href: '/cdc/placements',
    title: 'Placements',
    permModule: 'cdc.placements',
    description: 'Final placement records, multi-offer cascade, alumni outcomes bridge, NAAC/AICTE snapshots.',
    icon: Award,
    color: 'text-emerald-600 bg-emerald-50',
  },
  {
    href: '/cdc/internships',
    title: 'Internships',
    permModule: 'cdc.internships',
    description: 'Clinical, teaching practice, corporate internships. Certificate workflow + status timeline.',
    icon: GraduationCap,
    color: 'text-indigo-600 bg-indigo-50',
  },
  {
    href: '/cdc/idp',
    title: 'Individual Development Plans',
    permModule: 'cdc.idp',
    description: 'Native IDP form (replaces Google Form). Per-learner growth tracking with cycles.',
    icon: ClipboardList,
    color: 'text-purple-600 bg-purple-50',
  },
  {
    href: '/cdc/clubs',
    title: 'Clubs',
    permModule: 'cdc.clubs',
    description: 'Student clubs across institutions. Memberships, leadership roles, active/inactive status.',
    icon: Users2,
    color: 'text-pink-600 bg-pink-50',
  },
  {
    href: '/cdc/mentors',
    title: 'Mentor Pairings',
    permModule: 'cdc.mentors',
    description: 'Learner ↔ industry mentor pairings. Status, milestones, mentorship cycle.',
    icon: UserCheck,
    color: 'text-orange-600 bg-orange-50',
  },
  {
    href: '/cdc/training',
    title: 'Training Programmes',
    permModule: 'cdc.training',
    description: 'Unnati, MRB, Springboard, corporate training. Enrollment management + completion tracking.',
    icon: PresentationIcon,
    color: 'text-cyan-600 bg-cyan-50',
  },
  {
    href: '/cdc/udyog',
    title: 'UDYOG Tracker',
    permModule: 'cdc.udyog',
    description: 'UNNATI learners who must apply on the external UDYOG portal. Direct them out and record their application reference number.',
    icon: GraduationCap,
    color: 'text-teal-600 bg-teal-50',
  },
  {
    href: '/cdc/career-guidance',
    title: 'AI Career Guidance',
    permModule: 'cdc',
    description: 'Pick a student — AI suggests career paths, skill gaps and next steps from their record, and flags what data to record to sharpen it.',
    icon: Compass,
    color: 'text-violet-600 bg-violet-50',
  },
  {
    href: '/cdc/bulletin',
    title: 'Opportunities Bulletin',
    permModule: 'cdc.bulletin',
    description: 'Curated external opportunities — hackathons, conferences, contests, scholarships.',
    icon: Megaphone,
    color: 'text-amber-600 bg-amber-50',
  },
  {
    href: '/cdc/exports',
    title: 'Reports & Exports',
    permModule: 'cdc.exports',
    description: 'NAAC 8.2 (Graduate Progression), AICTE annual, flex-generator. Downloadable CSV/XLSX with column picker.',
    icon: FileDown,
    color: 'text-rose-600 bg-rose-50',
  },
  {
    href: '/cdc/industry-mentors',
    title: 'Industry Mentors',
    permModule: 'cdc.industry_mentors',
    description: 'Directory of industry mentors. Sector tags, expertise areas, availability.',
    icon: Factory,
    color: 'text-slate-600 bg-slate-50',
  },
];

export default function CdcLandingPage() {
  // Filter cards by per-submodule view permission. Super admins and users
  // with cdc.view skip the per-card check via canAccess's super-admin bypass.
  const { canAccess, isSuperAdmin } = usePermissions([], { waitForLoad: true });
  const visibleModules = CDC_MODULES.filter((mod) =>
    isSuperAdmin ? true : canAccess(mod.permModule, 'view'),
  );

  return (
    <PermissionGuard module="cdc" action="view">
      <ContentLayout title="Career Development Centre">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>CDC</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mt-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Career Development Centre</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Placements, internships, training, mentorship, and reporting for all JKKN
              institutions.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleModules.map((mod) => {
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
            {visibleModules.length === 0 && (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                No CDC sub-modules are accessible to your role. Contact an
                administrator if you believe this is incorrect.
              </div>
            )}
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
