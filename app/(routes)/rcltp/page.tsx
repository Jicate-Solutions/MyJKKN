'use client';

// =============================================================================
// /rcltp — Role-aware landing hub
// =============================================================================
// Replaces the old redirect-only stub. Detects the viewer's permissions and
// presents the lane(s) they can access as cards. Unbuilt lanes (student,
// teacher, principal) are shown as disabled placeholders so every role gets
// a clear picture of the module structure without fabricating screens.
//
// Permission keys:
//   Admin / head authoring  → rcltp.config.manage
//   Question approve gate   → rcltp.question.approve  (subset of above)
// =============================================================================

import Link from 'next/link';
import {
  BookOpenCheck,
  Settings2,
  GraduationCap,
  Users,
  LayoutDashboard,
  FileBarChart,
  Award,
  SlidersHorizontal,
  Lock,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LaneCard {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  available: boolean;
  phase?: string;
  /** If true, only render this card when the user has this permission */
  requiredPermission?: string;
  /**
   * If true, the destination page is super-admin only (e.g. it uses the
   * <SuperAdminOnly> guard). Non-super-admins see the card locked, even if
   * they hold `requiredPermission`. Prevents advertising a lane as
   * "Available" that the page itself will then refuse.
   */
  superAdminOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Lane definitions
// ---------------------------------------------------------------------------

const ALL_LANES: LaneCard[] = [
  {
    id: 'content',
    title: 'Content Authoring',
    description:
      'Manage the passage bank and comprehension questions. Create, review, and approve reading content before it reaches students.',
    href: '/rcltp/admin/content',
    icon: BookOpenCheck,
    available: true,
    requiredPermission: 'rcltp.config.manage',
  },
  {
    id: 'policies',
    title: 'Policies & Configuration',
    description:
      'Configure assessment scheduling, scoring thresholds, adaptive-practice volume, voice/audio retention, and consent defaults.',
    href: '/rcltp/admin/policies',
    icon: Settings2,
    available: true,
    requiredPermission: 'rcltp.config.manage',
    // The policies page uses <SuperAdminOnly> (writes platform_policies rows),
    // so only super-admins may actually open it. Gate the card to match.
    superAdminOnly: true,
  },
  {
    id: 'teacher',
    title: 'Teacher Console',
    description:
      'Open assessments for your class, schedule the cycle windows, review voice recordings, and approve comprehension questions.',
    href: '/rcltp/teacher',
    icon: Users,
    available: true,
    requiredPermission: 'rcltp.assessment.manage',
  },
  {
    id: 'principal',
    title: 'Principal Dashboard',
    description:
      'School-wide RCLTP analytics — cohort band distribution, cycle progress, and at-risk learner alerts. (Populates once MyJKKN scoring is enabled.)',
    href: '/rcltp/principal',
    icon: LayoutDashboard,
    available: true,
    requiredPermission: 'rcltp.report.view_all',
  },
  {
    id: 'student',
    title: 'Student Portal',
    description:
      'Take RCLTP assessments, view band results, and complete adaptive reading practice.',
    href: '/rcltp/student',
    icon: GraduationCap,
    available: true,
    requiredPermission: 'rcltp.assessment.take',
  },
  {
    id: 'reports',
    title: 'Reports & Dashboards',
    description:
      'Per-persona report shells — learner/parent score report, Senior Learner analytics, school-head dashboard. (Awaiting MyJKKN scoring + report catalog.)',
    href: '/rcltp/reports',
    icon: FileBarChart,
    available: true,
    requiredPermission: 'rcltp.report.view_all',
  },
  {
    id: 'gamification',
    title: 'Badges & Gamification',
    description:
      'Manage the badge catalog — names, points, and provisional award criteria. Badges are server-awarded only.',
    href: '/rcltp/admin/gamification',
    icon: Award,
    available: true,
    requiredPermission: 'rcltp.config.manage',
  },
  {
    id: 'bands',
    title: 'Band Cutoffs',
    description:
      'Configure provisional band score cutoffs per dimension. Provisional — pending MyJKKN validation; drives no live scoring yet.',
    href: '/rcltp/admin/bands',
    icon: SlidersHorizontal,
    available: true,
    requiredPermission: 'rcltp.config.manage',
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AvailableCard({ lane }: { lane: LaneCard }) {
  const Icon = lane.icon;
  return (
    <Link
      href={lane.href}
      className='group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 shadow-sm transition-all hover:border-primary/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      aria-label={`Open ${lane.title}`}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors'>
          <Icon className='h-5 w-5' aria-hidden='true' />
        </div>
        <Badge variant='default' className='text-xs'>
          Available
        </Badge>
      </div>
      <div>
        <h3 className='font-semibold text-foreground group-hover:text-primary transition-colors'>
          {lane.title}
        </h3>
        <p className='mt-1 text-sm text-muted-foreground leading-relaxed'>
          {lane.description}
        </p>
      </div>
    </Link>
  );
}

function PlaceholderCard({ lane }: { lane: LaneCard }) {
  const Icon = lane.icon;
  return (
    <div
      className='flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-6 opacity-60 cursor-not-allowed select-none'
      aria-label={`${lane.title} — not yet available`}
    >
      <div className='flex items-start justify-between gap-2'>
        <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
          <Icon className='h-5 w-5' aria-hidden='true' />
        </div>
        <div className='flex items-center gap-1.5'>
          <Lock className='h-3 w-3 text-muted-foreground' aria-hidden='true' />
          <span className='text-xs text-muted-foreground font-medium'>
            {lane.phase ?? 'Coming soon'}
          </span>
        </div>
      </div>
      <div>
        <h3 className='font-semibold text-muted-foreground'>{lane.title}</h3>
        <p className='mt-1 text-sm text-muted-foreground/80 leading-relaxed'>
          {lane.description}
        </p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
      {[1, 2, 3].map((i) => (
        <div key={i} className='rounded-xl border border-border bg-card p-6'>
          <div className='flex items-start justify-between gap-2 mb-3'>
            <Skeleton className='h-10 w-10 rounded-lg' />
            <Skeleton className='h-5 w-20 rounded-full' />
          </div>
          <Skeleton className='h-4 w-3/4 mb-2' />
          <Skeleton className='h-3 w-full mb-1' />
          <Skeleton className='h-3 w-5/6' />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RcltpHubPage() {
  const { can, isSuperAdmin, isLoading } = usePermissions();

  // Determine which lanes this user can see
  const visibleLanes = ALL_LANES.filter((lane) => {
    if (!lane.requiredPermission) return true; // placeholder lanes always shown
    return isSuperAdmin || can(lane.requiredPermission);
  });

  // If user has no admin permissions, show all lanes so they still see the
  // module structure — admin lanes will appear locked the same as phase stubs.
  const displayLanes =
    visibleLanes.length > 0
      ? ALL_LANES // always show full picture; permission controls card style
      : ALL_LANES;

  return (
    <ContentLayout title='MyJKKN RCLTP'>
      <div className='space-y-6'>
        {/* Header */}
        <div>
          <h1 className='text-2xl font-bold tracking-tight text-foreground'>
            MyJKKN Reading Assessment
          </h1>
          <p className='mt-1 text-sm text-muted-foreground max-w-2xl'>
            RCLTP (Reading Comprehension Learning &amp; Teaching Proficiency) — a
            structured reading-assessment module across Part A (Read &amp; Record) and
            Part B (comprehension). Select your lane below.
          </p>
        </div>

        {/* Lane grid */}
        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {displayLanes.map((lane) => {
              if (!lane.available) {
                return <PlaceholderCard key={lane.id} lane={lane} />;
              }
              // Available lane — show only if user has permission; else show locked.
              // superAdminOnly lanes require super-admin regardless of requiredPermission
              // (the destination page enforces the same, e.g. via <SuperAdminOnly>).
              const hasAccess = lane.superAdminOnly
                ? isSuperAdmin
                : isSuperAdmin ||
                  !lane.requiredPermission ||
                  can(lane.requiredPermission);

              return hasAccess ? (
                <AvailableCard key={lane.id} lane={lane} />
              ) : (
                <PlaceholderCard
                  key={lane.id}
                  lane={{ ...lane, available: false, phase: 'No access' }}
                />
              );
            })}
          </div>
        )}

        {/* Module note */}
        <p className='text-xs text-muted-foreground border-t pt-4'>
          MyJKKN RCLTP v1 is English-only. Additional languages are supported via the
          language column on passages — no schema change required. Contact your MyJKKN
          administrator to enable multi-language content.
        </p>
      </div>
    </ContentLayout>
  );
}
