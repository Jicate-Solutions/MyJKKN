'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Briefcase,
  FileCheck,
  Receipt,
  ArrowRight,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface DashboardStats {
  totalSolutions: number;
  activeSolutions: number;
  pendingDeliverables: number;
  totalPaid: number;
  totalOutstanding: number;
  pendingPayments: number;
}

interface RecentSolution {
  id: string;
  title: string;
  solution_code: string;
  solution_type: string;
  status: string;
  created_at: string;
}

interface PendingDeliverable {
  id: string;
  title: string;
  status: string;
  order?: {
    solution?: {
      title: string;
    };
  };
}

export default function ClientDashboardPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalSolutions: 0,
    activeSolutions: 0,
    pendingDeliverables: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    pendingPayments: 0,
  });
  const [recentSolutions, setRecentSolutions] = useState<RecentSolution[]>([]);
  const [pendingDeliverables, setPendingDeliverables] = useState<PendingDeliverable[]>([]);
  const [userName, setUserName] = useState('Client');

  useEffect(() => {
    async function fetchDashboard() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      // Get client info
      const { data: client } = await (supabase as any).from('sh_clients')
        .select('id, name')
        .eq('user_id', user.id)
        .single();

      if (!client) {
        setIsLoading(false);
        return;
      }

      setUserName(client.name.split(' ')[0]);

      // Get solutions for this client
      const { data: solutions } = await (supabase as any).from('sh_solutions')
        .select('id, title, solution_code, solution_type, status, created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false });

      const solutionsList = solutions || [];
      setRecentSolutions(solutionsList.slice(0, 3));

      // Get solution IDs for further queries
      const solutionIds = solutionsList.map(s => s.id);

      // Get deliverables pending review (via content orders)
      let pendingDeliverablesData: PendingDeliverable[] = [];
      if (solutionIds.length > 0) {
        const { data: orders } = await (supabase as any).from('sh_content_orders')
          .select('id, solution:sh_solutions(title)')
          .in('solution_id', solutionIds);

        if (orders && orders.length > 0) {
          const orderIds = orders.map(o => o.id);
          const { data: deliverables } = await (supabase as any).from('sh_content_deliverables')
            .select('id, title, status, order_id')
            .in('order_id', orderIds)
            .eq('status', 'review')
            .limit(5);

          pendingDeliverablesData = (deliverables || []).map(d => ({
            ...d,
            order: orders.find(o => o.id === d.order_id),
          }));
        }
      }
      setPendingDeliverables(pendingDeliverablesData);

      // Get payments
      let totalPaid = 0;
      let totalOutstanding = 0;
      let pendingPaymentsCount = 0;

      if (solutionIds.length > 0) {
        const { data: payments } = await (supabase as any).from('sh_payments')
          .select('amount, status')
          .in('solution_id', solutionIds);

        (payments || []).forEach(p => {
          if (p.status === 'received') {
            totalPaid += p.amount;
          } else if (['pending', 'invoiced', 'overdue'].includes(p.status)) {
            totalOutstanding += p.amount;
            pendingPaymentsCount++;
          }
        });
      }

      setStats({
        totalSolutions: solutionsList.length,
        activeSolutions: solutionsList.filter(s => s.status === 'active').length,
        pendingDeliverables: pendingDeliverablesData.length,
        totalPaid,
        totalOutstanding,
        pendingPayments: pendingPaymentsCount,
      });

      setIsLoading(false);
    }

    fetchDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {userName}
        </h1>
        <p className="text-muted-foreground">
          Here is an overview of your solutions and deliverables.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Solutions</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalSolutions}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeSolutions} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingDeliverables}</div>
            <p className="text-xs text-muted-foreground">Deliverables awaiting your approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(stats.totalPaid)}
            </div>
            <p className="text-xs text-muted-foreground">Across all solutions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
            <Clock className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(stats.totalOutstanding)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.pendingPayments} pending invoice{stats.pendingPayments !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Solutions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Solutions</h2>
          <Link href="/portal/client/projects">
            <Button variant="ghost" size="sm">
              View All
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
        {recentSolutions.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recentSolutions.map((solution) => (
              <Card key={solution.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{solution.title}</CardTitle>
                      <p className="text-sm text-muted-foreground font-mono mt-1">
                        {solution.solution_code}
                      </p>
                    </div>
                    <Badge variant="outline">{solution.solution_type}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge
                      className={
                        solution.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : solution.status === 'completed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }
                    >
                      {solution.status}
                    </Badge>
                    <Link href={`/portal/client/projects/${solution.id}`}>
                      <Button variant="ghost" size="sm">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No solutions yet</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Pending Deliverables */}
      {pendingDeliverables.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Awaiting Your Review</h2>
            <Link href="/portal/client/deliverables">
              <Button variant="ghost" size="sm">
                View All
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          <Card>
            <CardContent className="divide-y">
              {pendingDeliverables.map((deliverable) => (
                <div
                  key={deliverable.id}
                  className="flex items-center justify-between py-4 first:pt-6 last:pb-6"
                >
                  <div>
                    <p className="font-medium">{deliverable.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {(deliverable.order?.solution as any)?.title || 'Solution'}
                    </p>
                  </div>
                  <Link href="/portal/client/deliverables">
                    <Button size="sm">Review</Button>
                  </Link>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
