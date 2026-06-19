// ============================================================================
// Admin — HR (hub page)
// Created: 2026-05-19.
//
// Why this page exists:
//   /hr/admin previously had no page.tsx, so any director who typed
//   `/hr/admin` (or followed an outdated link) hit a 404 after auth.
//   17 subroutes already exist under /hr/admin/* — this page makes them
//   discoverable from a single landing instead of requiring users to know
//   the exact subpath in advance.
//
// What's here:
//   18 ActionCards grouped into 6 categories:
//     - Policies & Configuration  (5 cards)
//     - Recruitment               (2 cards)
//     - Payroll                   (2 cards)
//     - People & Performance      (4 cards)
//     - Compliance & Exit         (4 cards)
//     - Forms                     (1 card)
//
// Categorization rationale:
//   Groups follow the lifecycle stages an HR admin actually walks through
//   (hire → onboard → run payroll → review → discipline → offboard) so
//   that even a director with no exposure to the subroute structure can
//   locate the right page by intuition rather than search.
//
// Audience gating:
//   (Updated 2026-06-10, relocation /admin/hr → /hr/admin.) The hub renders
//   permissively; each destination page enforces its own role checks
//   (super_admin / hr_head / hr_officer / director_jkkn) — keeping the hub
//   itself permissive avoids re-encoding gates in two places. This matches
//   the old /admin layout posture, which was also intentionally permissive
//   (no middleware gate exists — see PR #1210 RBAC audit).
// ============================================================================

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Award,
  Banknote,
  Briefcase,
  ClipboardList,
  FileText,
  GraduationCap,
  ListChecks,
  Megaphone,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserMinus,
  UserX,
  Wallet,
  Wrench,
  Workflow,
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PermissionGuard } from '@/components/auth/permission-guard';

type ActionCardProps = {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

type Section = {
  title: string;
  description: string;
  cards: ActionCardProps[];
};

const SECTIONS: Section[] = [
  {
    title: 'Policies & Configuration',
    description:
      'Foundational rules and templates that drive every HR workflow on the platform.',
    cards: [
      {
        href: '/hr/admin/policies',
        icon: ShieldCheck,
        title: 'HR Policies',
        description:
          'All policy categories — leave, working schedule, code of conduct, allowances, RD, welfare, and more.',
      },
      {
        href: '/hr/admin/required-documents',
        icon: ClipboardList,
        title: 'Required Documents',
        description:
          'Document checklists each role must submit (PAN, Aadhaar, certificates, etc.).',
      },
      {
        href: '/hr/admin/onboarding-checklists',
        icon: ListChecks,
        title: 'Onboarding Checklists',
        description:
          'Step-by-step joining workflows assigned per role category.',
      },
      {
        href: '/hr/admin/shift-templates',
        icon: ClipboardList,
        title: 'Shift Templates',
        description:
          'Pre-defined working-hour patterns for attendance scheduling.',
      },
      {
        href: '/hr/admin/automation-rules',
        icon: Workflow,
        title: 'Automation Rules',
        description:
          'Triggered rules that move HR cases between stages without manual review.',
      },
    ],
  },
  {
    title: 'Recruitment',
    description: 'Hiring approval flows and maintenance for stuck candidates.',
    cards: [
      {
        href: '/hr/admin/recruitment-maintenance',
        icon: Wrench,
        title: 'Recruitment Maintenance',
        description:
          'Backfill approval chains for candidates submitted before flows were configured.',
      },
      {
        href: '/hr/admin/recruitment-approvals-scope',
        icon: ShieldCheck,
        title: 'Approval Scope',
        description:
          'Configure who can approve at each step of the recruitment chain.',
      },
    ],
  },
  {
    title: 'Payroll',
    description:
      'Monthly pay-period preparation, approval, and payslip generation.',
    cards: [
      {
        href: '/hr/admin/payroll/periods',
        icon: Banknote,
        title: 'Payroll Periods',
        description:
          'Prepare, review, and approve each pay period through the 7-stage workflow.',
      },
      {
        href: '/hr/admin/payroll/preview',
        icon: Wallet,
        title: 'Payroll Preview',
        description:
          'Live preview of pay components, deductions, and net pay before period prepare.',
      },
    ],
  },
  {
    title: 'People & Performance',
    description:
      'Growth-side workflows — promotions, reviews, training, and faculty development.',
    cards: [
      {
        href: '/hr/admin/promotions',
        icon: TrendingUp,
        title: 'Promotions',
        description:
          'Promotion proposals, suggestions, and approval pipelines.',
      },
      {
        href: '/hr/admin/performance-reviews',
        icon: Award,
        title: 'Performance Reviews',
        description:
          'Review cycles, KPI rubrics, and per-employee evaluation history.',
      },
      {
        href: '/hr/admin/training',
        icon: GraduationCap,
        title: 'Training',
        description:
          'Skill-building programs, attendance, and completion certificates.',
      },
      {
        href: '/hr/admin/fdp',
        icon: Sparkles,
        title: 'Faculty Development (FDP)',
        description:
          'Faculty Development Programs — proposals, sponsorship, and reporting.',
      },
    ],
  },
  {
    title: 'Compliance & Exit',
    description:
      'Memos, discipline, separations, and post-employment workflows.',
    cards: [
      {
        href: '/hr/admin/memos',
        icon: Megaphone,
        title: 'Memos',
        description:
          'Issue, track, and analyze official memos to staff (warning, appreciation, etc.).',
      },
      {
        href: '/hr/admin/disciplinary',
        icon: UserX,
        title: 'Disciplinary',
        description:
          'Disciplinary cases with structured investigation and outcome workflow.',
      },
      {
        href: '/hr/admin/offboarding',
        icon: UserMinus,
        title: 'Offboarding',
        description:
          'Resignation, retirement, and full-and-final settlement workflows.',
      },
      {
        href: '/hr/admin/terminations',
        icon: ScrollText,
        title: 'Terminations',
        description:
          'Termination cases with SEDC → Legal → Director approval chain.',
      },
    ],
  },
  {
    title: 'Forms',
    description: 'Custom HR forms — definitions, builders, and submissions.',
    cards: [
      {
        href: '/hr/admin/forms',
        icon: FileText,
        title: 'HR Forms',
        description:
          'Build custom forms, configure their workflow, and inspect submissions.',
      },
    ],
  },
];

export default function AdminHRHubPage() {
  return (
    // Audience: HR-admin hub is restricted to core HR (hr.dashboard.view holders:
    // HR Admin/Head/Manager, CEO/COO, Board) + super admins. Added 2026-06-19
    // after the hub rendered for ANY authenticated user — including learners —
    // because it was intentionally left unguarded on the (false) assumption that
    // every destination self-gates. Director decision: strict / core-HR only.
    <PermissionGuard
      module="hr.dashboard"
      action="view"
      fallback={
        <ContentLayout title="HR Admin">
          <div className="rounded-md border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            The HR administration area is restricted to the HR team. If you need
            access, contact your HR administrator.
          </div>
        </ContentLayout>
      }
    >
    <ContentLayout title="HR Admin">
      <div className="space-y-8">
        <header>
          <div className="flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">HR Administration</h1>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Configuration and admin workflows across the HR lifecycle. Pick a
            section to manage policies, hire approvals, payroll, people
            programs, compliance, or forms.
          </p>
        </header>

        {SECTIONS.map((section) => (
          <section key={section.title} className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="text-sm text-muted-foreground">
                {section.description}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {section.cards.map((card) => (
                <ActionCard key={card.href} {...card} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}

function ActionCard({ href, icon: Icon, title, description }: ActionCardProps) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-primary hover:bg-muted/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

