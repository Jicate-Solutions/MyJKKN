'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Trophy,
  LayoutDashboard,
  ShieldCheck,
  Users,
  ArrowRight,
  Target,
  Rocket,
  GraduationCap,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-provider';
import { useMySF100Enrollment, useSF100PublicStats, useSF100Programs } from '@/hooks/startup-studio';

const ADMIN_ROLES = ['super_admin', 'administrator', 'hod', 'principal'];
const MENTOR_ROLES = ['faculty'];
const LEARNER_ROLES = ['student'];

interface RouteCard {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  description: string;
  badgeLabel?: string;
  primary?: boolean;
}

function LandingRouteCard({ card }: { card: RouteCard }) {
  const Icon = card.icon;
  return (
    <Card
      className={`group cursor-pointer transition-all hover:shadow-md ${
        card.primary ? 'border-primary/40 bg-primary/5' : ''
      }`}
    >
      <Link href={card.href} className="block">
        <CardContent className="flex items-center gap-4 py-5">
          <div
            className={`h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
              card.primary ? 'bg-primary/10' : 'bg-muted'
            }`}
          >
            <Icon className={`h-5 w-5 ${card.iconColor}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm">{card.title}</p>
              {card.badgeLabel && (
                <Badge variant="secondary" className="text-[10px] py-0">
                  {card.badgeLabel}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-shrink-0" />
        </CardContent>
      </Link>
    </Card>
  );
}

function ProgramStatsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="text-center space-y-1">
          <Skeleton className="h-7 w-12 mx-auto" />
          <Skeleton className="h-3 w-20 mx-auto" />
        </div>
      ))}
    </div>
  );
}

export function SF100Landing() {
  const { profile, isLoading: authLoading } = useAuth();

  // Discover active program instead of hardcoded 'current'
  const { data: programsRaw } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const activeProgram = programs.find((p: any) => p.status === 'active') || programs[0];
  const activeProgramId: string = activeProgram?.id ?? '';

  const { data: stats, isLoading: statsLoading } = useSF100PublicStats(activeProgramId);

  const { data: myEnrollment, isLoading: enrollmentLoading } =
    useMySF100Enrollment(activeProgramId);
  const isEnrolled = !!(myEnrollment as any)?.id;

  const role = profile?.role ?? '';
  const isAdmin = ADMIN_ROLES.includes(role);
  const isMentor = MENTOR_ROLES.includes(role);
  const isLearner = LEARNER_ROLES.includes(role);

  const isLoading = authLoading || enrollmentLoading;

  // Build role-specific route cards
  const routeCards: RouteCard[] = [];

  if (isLearner || (!isAdmin && !isMentor)) {
    if (isEnrolled) {
      routeCards.push({
        href: '/startup-studio/solve-for-100/dashboard',
        icon: LayoutDashboard,
        iconColor: 'text-primary',
        title: 'Team Dashboard',
        description: 'View paid users, phase progress, and weekly check-ins',
        badgeLabel: myEnrollment?.team_name ?? undefined,
        primary: true,
      });
    } else {
      routeCards.push({
        href: '/startup-studio/solve-for-100/apply',
        icon: Rocket,
        iconColor: 'text-primary',
        title: 'Apply to Solve for 100',
        description: 'Register your team and start your 210-day journey',
        primary: true,
      });
    }
  }

  if (isMentor || isAdmin) {
    routeCards.push({
      href: '/startup-studio/solve-for-100/mentor',
      icon: Users,
      iconColor: 'text-purple-600',
      title: 'Mentor Dashboard',
      description: 'Review check-ins, verify paid users, give feedback',
      primary: isMentor,
    });
  }

  if (isAdmin) {
    routeCards.push(
      {
        href: '/startup-studio/solve-for-100/admin',
        icon: ShieldCheck,
        iconColor: 'text-blue-600',
        title: 'Admin Panel',
        description: 'Manage programs, enrollments, and support approvals',
        primary: true,
      },
      {
        href: '/startup-studio/solve-for-100/verification',
        icon: ShieldCheck,
        iconColor: 'text-amber-600',
        title: 'Verification Queue',
        description: 'Approve or reject paid user submissions',
      }
    );
  }

  // Everyone sees the leaderboard
  routeCards.push({
    href: '/startup-studio/solve-for-100/leaderboard',
    icon: Trophy,
    iconColor: 'text-amber-500',
    title: 'Public Leaderboard',
    description: 'See which teams are leading the race to 100',
  });

  return (
    <div className="space-y-6">
      {/* Program Overview Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="font-bold text-base">What is Solve for 100?</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                A 210-day structured startup program where JKKN learner teams build real products and
                acquire 100 paying users. Top teams graduate to the{' '}
                <span className="font-medium text-foreground">
                  Nattraja Incubation Forum (NIF)
                </span>{' '}
                for full institutional backing.
              </p>
            </div>
          </div>
        </div>

        {/* Live program stats */}
        <CardContent className="py-4">
          {statsLoading ? (
            <ProgramStatsSkeleton />
          ) : stats ? (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xl font-bold tabular-nums">
                  {stats.active_enrollments ?? stats.activeTeams ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">Active Teams</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">
                  {stats.total_paid_users ?? stats.totalPaidUsers ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">Paid Users Logged</p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">
                  {stats.graduated_teams ?? stats.graduatedTeams ?? '—'}
                </p>
                <p className="text-xs text-muted-foreground">Graduated to NIF</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Program stats unavailable
            </p>
          )}
        </CardContent>
      </Card>

      {/* Role-based navigation */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-3">
          {routeCards.map((card) => (
            <LandingRouteCard key={card.href} card={card} />
          ))}
        </div>
      )}

      {/* Journey overview — phases at a glance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
            The Journey
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { phase: '1', label: 'Setup', detail: 'Team formation & idea' },
              { phase: '2', label: 'Problem-Solution Fit', detail: 'Customer interviews' },
              { phase: '3', label: 'First Users', detail: '5+ paid users' },
              { phase: '4', label: 'Growth', detail: '25+ paid users' },
              { phase: '5', label: '100 Users', detail: 'The goal' },
              { phase: '6', label: 'Graduated → NIF', detail: 'Institutional backing' },
            ].map((item) => (
              <div
                key={item.phase}
                className="rounded-lg border border-border/60 p-2.5 space-y-0.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded-full bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground">
                    {item.phase}
                  </span>
                  <p className="text-xs font-semibold leading-tight">{item.label}</p>
                </div>
                <p className="text-[10px] text-muted-foreground pl-6">{item.detail}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
