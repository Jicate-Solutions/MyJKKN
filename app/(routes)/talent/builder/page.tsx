'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FolderKanban,
  Hammer,
  Wrench,
  Wallet,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge variant="default">Active</Badge>;
    case 'approved':
      return <Badge variant="secondary" className="bg-green-100 text-green-800">Approved</Badge>;
    case 'requested':
      return <Badge variant="outline" className="border-yellow-500 text-yellow-700">Pending</Badge>;
    case 'completed':
      return <Badge variant="secondary">Completed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface BuilderStats {
  active_assignments: number;
  completed_assignments: number;
  total_earnings: number;
  skills_count: number;
}

interface Assignment {
  id: string;
  status: string;
  role: string;
  requested_at: string;
  phase?: {
    id: string;
    title: string;
    solution?: {
      solution_code: string;
      title: string;
      client?: {
        name: string;
      };
    };
  };
}

export default function BuilderPortalPage() {
  const [builderId, setBuilderId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<BuilderStats | null>(null);
  const [activeAssignments, setActiveAssignments] = useState<Assignment[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<Assignment[]>([]);
  const [availablePhaseCount, setAvailablePhaseCount] = useState(0);

  useEffect(() => {
    async function fetchBuilderData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      // Get builder profile
      const { data: builder } = await supabase
        .from('sh_builders')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!builder) {
        setIsLoading(false);
        return;
      }

      setBuilderId(builder.id);

      // Fetch stats
      const [
        { count: activeCount },
        { count: completedCount },
        { data: earningsData },
        { count: skillsCount },
        { data: assignments },
        { count: availableCount },
      ] = await Promise.all([
        supabase.from('sh_builder_assignments').select('*', { count: 'exact', head: true }).eq('builder_id', builder.id).eq('status', 'active'),
        supabase.from('sh_builder_assignments').select('*', { count: 'exact', head: true }).eq('builder_id', builder.id).eq('status', 'completed'),
        supabase.from('sh_earnings_ledger').select('amount').eq('recipient_id', builder.id).eq('recipient_type', 'builder'),
        supabase.from('sh_builder_skills').select('*', { count: 'exact', head: true }).eq('builder_id', builder.id),
        supabase.from('sh_builder_assignments')
          .select(`
            id, status, role, requested_at,
            phase:sh_solution_phases(
              id, title,
              solution:sh_solutions(
                solution_code, title,
                client:sh_clients(name)
              )
            )
          `)
          .eq('builder_id', builder.id)
          .in('status', ['active', 'approved', 'requested'])
          .order('requested_at', { ascending: false })
          .limit(10),
        supabase.from('sh_solution_phases').select('*', { count: 'exact', head: true }).in('status', ['prd_writing', 'prototype_building', 'revisions']),
      ]);

      const totalEarnings = earningsData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0;

      setStats({
        active_assignments: activeCount || 0,
        completed_assignments: completedCount || 0,
        total_earnings: totalEarnings,
        skills_count: skillsCount || 0,
      });

      const active = (assignments || []).filter(a => a.status === 'active' || a.status === 'approved');
      const pending = (assignments || []).filter(a => a.status === 'requested');

      setActiveAssignments(active as Assignment[]);
      setPendingApprovals(pending as Assignment[]);
      setAvailablePhaseCount(availableCount || 0);
      setIsLoading(false);
    }

    fetchBuilderData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome to Builder Portal
        </h1>
        <p className="text-muted-foreground">
          Manage your assignments, claim new phases, and track your earnings.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Assignments</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active_assignments || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.completed_assignments || 0} completed total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Phases</CardTitle>
            <Hammer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availablePhaseCount}</div>
            <p className="text-xs text-muted-foreground">
              Phases you can claim
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">My Skills</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.skills_count || 0}</div>
            <p className="text-xs text-muted-foreground">
              Skills registered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats?.total_earnings || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              From all phases
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Assignments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Active Assignments</CardTitle>
              <CardDescription>Phases you are currently working on</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/talent/builder/assignments">
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {activeAssignments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FolderKanban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No active assignments</p>
                <Button variant="link" asChild className="mt-2">
                  <Link href="/talent/builder/available">Browse available phases</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeAssignments.slice(0, 5).map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {assignment.phase?.title || 'Untitled Phase'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {assignment.phase?.solution?.solution_code} -{' '}
                        {assignment.phase?.solution?.client?.name || 'No Client'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(assignment.status)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Pending Approvals
            </CardTitle>
            <CardDescription>Assignment requests awaiting approval</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingApprovals.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No pending requests</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingApprovals.map((approval) => (
                  <div
                    key={approval.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-yellow-200 bg-yellow-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {approval.phase?.title || 'Untitled Phase'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Requested on{' '}
                        {new Date(approval.requested_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-yellow-500 text-yellow-700">
                      Pending
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/talent/builder/available">
                <Hammer className="h-6 w-6" />
                Claim New Phase
              </Link>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/talent/builder/skills">
                <Wrench className="h-6 w-6" />
                Manage Skills
              </Link>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2" asChild>
              <Link href="/talent/builder/earnings">
                <Wallet className="h-6 w-6" />
                View Earnings
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
