'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  DollarSign,
  GraduationCap,
  AlertTriangle,
  Target,
  TrendingUp,
  Calendar,
  ArrowRight,
  Plus,
} from 'lucide-react';
import {
  useSF100Programs,
  useSF100Program,
  useSF100PhaseFunnel,
  useSF100VerificationQueue,
  useSF100Enrollments,
} from '@/hooks/startup-studio';
import { SF100EnrollmentsTable } from '../../programs/[programId]/enrollments/_components/sf100-enrollments-table';
import { SF100VerificationQueue as SF100VerificationQueueRich } from '../../programs/[programId]/verification-queue/_components/sf100-verification-queue';

// ── Phase colors ────────────────────────────────────────────────────
const PHASE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ideation: { label: 'Ideation', color: 'text-indigo-700', bg: 'bg-indigo-100' },
  validation: { label: 'Validation', color: 'text-amber-700', bg: 'bg-amber-100' },
  mvp: { label: 'MVP', color: 'text-blue-700', bg: 'bg-blue-100' },
  revenue: { label: 'Revenue', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  growth: { label: 'Growth', color: 'text-violet-700', bg: 'bg-violet-100' },
  graduated: { label: 'Graduated', color: 'text-green-700', bg: 'bg-green-100' },
  stalled: { label: 'Stalled', color: 'text-red-700', bg: 'bg-red-100' },
  eliminated: { label: 'Eliminated', color: 'text-gray-700', bg: 'bg-gray-100' },
};

const PROGRAM_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  enrolling: { label: 'Enrolling', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  active: { label: 'Active', className: 'bg-green-100 text-green-700 border-green-200' },
  completed: { label: 'Completed', className: 'bg-purple-100 text-purple-700 border-purple-200' },
  archived: { label: 'Archived', className: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const VALID_TABS = ['overview', 'programs', 'enrollments', 'verification'] as const;

// ── Loading skeleton ────────────────────────────────────────────────
function AdminSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

// ── Stat Card ───────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, accent }: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${accent || ''}`}>{value}</p>
          </div>
          <div className="p-3 rounded-full bg-muted">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Action Required Banner ──────────────────────────────────────────
function ActionRequiredBanner({
  pendingVerifications,
  stalledTeams,
  onJumpToVerification,
}: {
  pendingVerifications: number;
  stalledTeams: number;
  onJumpToVerification: () => void;
}) {
  const hasActions = pendingVerifications > 0 || stalledTeams > 0;
  if (!hasActions) return null;

  return (
    <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex flex-wrap gap-4 text-sm">
          {pendingVerifications > 0 && (
            <span className="font-medium">
              <strong className="text-amber-700 dark:text-amber-400">{pendingVerifications}</strong> verifications pending review
            </span>
          )}
          {stalledTeams > 0 && (
            <span className="font-medium">
              <strong className="text-red-700 dark:text-red-400">{stalledTeams}</strong> teams stalled (14+ days)
            </span>
          )}
        </div>
        {pendingVerifications > 0 && (
          <Button size="sm" variant="outline" onClick={onJumpToVerification} className="shrink-0">
            Review now
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

// ── Phase Funnel ────────────────────────────────────────────────────
function PhaseFunnel({ data }: { data: any[] }) {
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No phase data available</p>;
  }

  const maxCount = Math.max(...data.map((d: any) => d.count || 0), 1);

  return (
    <div className="space-y-2">
      {data.map((phase: any) => {
        const config = PHASE_CONFIG[phase.phase] || { label: phase.phase, color: 'text-gray-700', bg: 'bg-gray-100' };
        const pct = Math.max(((phase.count || 0) / maxCount) * 100, 6);
        return (
          <div key={phase.phase} className="flex items-center gap-3">
            <div className="w-24 shrink-0">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${config.bg} ${config.color}`}>
                {config.label}
              </span>
            </div>
            <div className="flex-1 h-8 bg-muted rounded overflow-hidden">
              <div
                className={`h-full ${config.bg} rounded flex items-center px-2 transition-all`}
                style={{ width: `${pct}%` }}
              >
                <span className={`text-xs font-bold ${config.color}`}>{phase.count || 0}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Programs Grid (new) ─────────────────────────────────────────────
function ProgramsGrid({ programs }: { programs: any[] }) {
  if (!programs || programs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center border rounded-lg bg-muted/30">
        <Plus className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-lg font-medium">No programs yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first Solve for 100 program to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {programs.map((program: any) => {
        const statusConfig = PROGRAM_STATUS_CONFIG[program.status] ?? PROGRAM_STATUS_CONFIG.draft;
        const deadline = program.hard_deadline
          ? new Date(program.hard_deadline).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            })
          : 'No deadline set';

        return (
          <Card key={program.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-tight line-clamp-2">
                  {program.name}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs font-medium ${statusConfig.className}`}
                >
                  {statusConfig.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {program.team_count ?? 0} teams
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {deadline}
                </span>
              </div>
              <div className="flex justify-end">
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={`/startup-studio/solve-for-100/programs/${program.id}`}
                    className="flex items-center gap-1.5"
                  >
                    Open
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Main Admin Dashboard ────────────────────────────────────────────
export function SF100AdminDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL query param support — deep linkable tabs
  const urlTab = searchParams.get('tab');
  const initialTab = (urlTab && (VALID_TABS as readonly string[]).includes(urlTab)) ? urlTab : 'overview';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Program selector (defaults to active program, but admin can switch)
  const { data: programsRaw, isLoading: programsLoading } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const defaultProgram = programs.find((p: any) => p.status === 'active') || programs[0];

  const urlProgramId = searchParams.get('program');
  const [selectedProgramId, setSelectedProgramId] = useState<string>(urlProgramId || '');

  // Sync programId once programs load
  useEffect(() => {
    if (!selectedProgramId && defaultProgram?.id) {
      setSelectedProgramId(defaultProgram.id);
    }
  }, [defaultProgram?.id, selectedProgramId]);

  const programId = selectedProgramId || defaultProgram?.id || '';

  // Update URL when tab or program changes
  const updateUrl = (tab: string, progId: string) => {
    const params = new URLSearchParams();
    if (tab !== 'overview') params.set('tab', tab);
    if (progId && progId !== defaultProgram?.id) params.set('program', progId);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    updateUrl(tab, programId);
  };

  const handleProgramChange = (newId: string) => {
    setSelectedProgramId(newId);
    updateUrl(activeTab, newId);
  };

  // Fetch data for the selected program
  const { data: program, isLoading: programLoading } = useSF100Program(programId);
  const { data: funnelRaw, isLoading: funnelLoading } = useSF100PhaseFunnel(programId);
  const { data: queueRaw } = useSF100VerificationQueue(programId);
  const { data: enrollmentsRaw, isLoading: enrollmentsLoading } = useSF100Enrollments(programId);

  // Normalize
  const funnelData: any[] = Array.isArray(funnelRaw) ? funnelRaw : [];
  const verificationQueue: any[] = Array.isArray(queueRaw) ? queueRaw : [];
  const enrollments: any[] = Array.isArray(enrollmentsRaw) ? enrollmentsRaw : (enrollmentsRaw as any)?.data || [];
  const prog: any = program || {};

  const isLoading = programsLoading || programLoading || funnelLoading || enrollmentsLoading;
  if (isLoading) return <AdminSkeleton />;

  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No Solve for 100 programs yet</p>
          <Button>
            <Plus className="h-4 w-4 mr-2" /> Create Program
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Stats
  const totalEnrolled = enrollments.length;
  const activeEnrolled = enrollments.filter((e: any) => e.status === 'active').length;
  const totalPaidUsers = enrollments.reduce((sum: number, e: any) => sum + (e.cumulative_paid_users || 0), 0);
  const totalRevenue = enrollments.reduce((sum: number, e: any) => sum + (Number(e.total_revenue) || 0), 0);
  const stalledCount = enrollments.filter((e: any) => {
    if (!e.last_check_in_at) return true;
    const daysSince = (Date.now() - new Date(e.last_check_in_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 14;
  }).length;

  return (
    <div className="space-y-6">
      {/* Action Required Banner */}
      <ActionRequiredBanner
        pendingVerifications={verificationQueue.length}
        stalledTeams={stalledCount}
        onJumpToVerification={() => handleTabChange('verification')}
      />

      {/* Program Header + Selector */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-semibold">{prog.name || 'Solve for 100'}</h2>
                <Badge
                  variant="outline"
                  className={`text-xs ${(PROGRAM_STATUS_CONFIG[prog.status] ?? PROGRAM_STATUS_CONFIG.draft).className}`}
                >
                  {(PROGRAM_STATUS_CONFIG[prog.status] ?? PROGRAM_STATUS_CONFIG.draft).label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {prog.enrollment_start && `Started ${new Date(prog.enrollment_start).toLocaleDateString('en-IN')}`}
                {prog.hard_deadline && ` · Deadline ${new Date(prog.hard_deadline).toLocaleDateString('en-IN')}`}
              </p>
            </div>
            {programs.length > 1 && (
              <Select value={programId} onValueChange={handleProgramChange}>
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue placeholder="Select program" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Teams Enrolled" value={totalEnrolled} icon={Users} />
        <StatCard title="Active" value={activeEnrolled} icon={TrendingUp} accent="text-green-600" />
        <StatCard title="Total Paid Users" value={totalPaidUsers} icon={Target} accent="text-blue-600" />
        <StatCard title="Total Revenue" value={`₹${totalRevenue.toLocaleString()}`} icon={DollarSign} accent="text-emerald-600" />
        <StatCard title="Stalled (14d+)" value={stalledCount} icon={AlertTriangle} accent={stalledCount > 0 ? 'text-red-600' : 'text-green-600'} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Phase Funnel</TabsTrigger>
          <TabsTrigger value="programs">Programs ({programs.length})</TabsTrigger>
          <TabsTrigger value="enrollments">Enrollments ({totalEnrolled})</TabsTrigger>
          <TabsTrigger value="verification">
            Verification{verificationQueue.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold px-1.5 min-w-[1.25rem] h-5">
                {verificationQueue.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GraduationCap className="h-5 w-5" />
                Phase Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PhaseFunnel data={funnelData} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="programs">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="h-5 w-5" />
                  All Programs
                </CardTitle>
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1.5" /> New Program
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ProgramsGrid programs={programs} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollments">
          <SF100EnrollmentsTable programId={programId} />
        </TabsContent>

        <TabsContent value="verification">
          <SF100VerificationQueueRich programId={programId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
