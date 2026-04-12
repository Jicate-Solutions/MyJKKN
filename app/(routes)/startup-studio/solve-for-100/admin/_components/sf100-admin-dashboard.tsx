'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  DollarSign,
  GraduationCap,
  AlertTriangle,
  ShieldCheck,
  Target,
  AlertCircle,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  useSF100Programs,
  useSF100Program,
  useSF100PhaseFunnel,
  useSF100VerificationQueue,
  useSF100Enrollments,
} from '@/hooks/startup-studio';

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

// ── Verification Queue ──────────────────────────────────────────────
function VerificationQueue({ items }: { items: any[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8">
        <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
        <p className="text-sm font-medium">All clear</p>
        <p className="text-xs text-muted-foreground">No pending verifications</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 10).map((item: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.team_name || 'Unknown Team'}</p>
            <p className="text-xs text-muted-foreground">
              {item.paid_users_count ?? 0} paid users reported
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 text-xs">
            Pending
          </Badge>
        </div>
      ))}
      {items.length > 10 && (
        <p className="text-xs text-muted-foreground text-center">
          +{items.length - 10} more
        </p>
      )}
    </div>
  );
}

// ── Enrollments Table ───────────────────────────────────────────────
function EnrollmentsTable({ enrollments }: { enrollments: any[] }) {
  if (!enrollments || enrollments.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No enrollments yet</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2 font-medium text-muted-foreground">Team</th>
            <th className="pb-2 font-medium text-muted-foreground">Phase</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Paid Users</th>
            <th className="pb-2 font-medium text-muted-foreground text-right">Revenue</th>
            <th className="pb-2 font-medium text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e: any) => {
            const phase = PHASE_CONFIG[e.current_phase] || { label: e.current_phase, color: 'text-gray-700', bg: 'bg-gray-100' };
            const teamName = e.registration?.team_name || e.team_name || 'Unknown';
            return (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/50">
                <td className="py-3">
                  <Link
                    href={`/startup-studio/solve-for-100/team/${e.id}`}
                    className="font-medium hover:underline"
                  >
                    {teamName}
                  </Link>
                </td>
                <td className="py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${phase.bg} ${phase.color}`}>
                    {phase.label}
                  </span>
                </td>
                <td className="py-3 text-right font-mono">{e.cumulative_paid_users || 0}</td>
                <td className="py-3 text-right font-mono">
                  {e.total_revenue ? `₹${Number(e.total_revenue).toLocaleString()}` : '₹0'}
                </td>
                <td className="py-3">
                  <Badge variant={e.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                    {e.status}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Admin Dashboard ────────────────────────────────────────────
export function SF100AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  // Step 1: Discover active program
  const { data: programsRaw, isLoading: programsLoading } = useSF100Programs();
  const programs = Array.isArray(programsRaw) ? programsRaw : (programsRaw as any)?.data || [];
  const activeProgram = programs.find((p: any) => p.status === 'active') || programs[0];
  const programId: string = activeProgram?.id ?? '';

  // Step 2: Fetch all data for the active program
  const { data: program, isLoading: programLoading } = useSF100Program(programId);
  const { data: funnelRaw, isLoading: funnelLoading } = useSF100PhaseFunnel(programId);
  const { data: queueRaw } = useSF100VerificationQueue(programId);
  const { data: enrollmentsRaw, isLoading: enrollmentsLoading } = useSF100Enrollments(programId);

  // Normalize data
  const funnelData: any[] = Array.isArray(funnelRaw) ? funnelRaw : [];
  const verificationQueue: any[] = Array.isArray(queueRaw) ? queueRaw : [];
  const enrollments: any[] = Array.isArray(enrollmentsRaw) ? enrollmentsRaw : (enrollmentsRaw as any)?.data || [];
  const prog: any = program || {};

  const isLoading = programsLoading || programLoading || funnelLoading || enrollmentsLoading;

  if (isLoading) return <AdminSkeleton />;

  if (!programId) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Target className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No Solve for 100 program found</p>
        </CardContent>
      </Card>
    );
  }

  // Compute stats
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
      {/* Program Header */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="font-semibold">{prog.name || 'Solve for 100'}</h2>
              <p className="text-xs text-muted-foreground">
                {prog.enrollment_start && `Started ${new Date(prog.enrollment_start).toLocaleDateString()}`}
                {prog.hard_deadline && ` · Deadline ${new Date(prog.hard_deadline).toLocaleDateString()}`}
              </p>
            </div>
            <Badge variant={prog.status === 'active' ? 'default' : 'secondary'}>
              {prog.status || 'unknown'}
            </Badge>
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

      {/* Tabs: Overview / Enrollments / Verification */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Phase Funnel</TabsTrigger>
          <TabsTrigger value="enrollments">
            Enrollments ({totalEnrolled})
          </TabsTrigger>
          <TabsTrigger value="verification">
            Verification Queue ({verificationQueue.length})
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

        <TabsContent value="enrollments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5" />
                All Enrollments
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EnrollmentsTable enrollments={enrollments} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verification">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-5 w-5" />
                Pending Verifications
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VerificationQueue items={verificationQueue} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
