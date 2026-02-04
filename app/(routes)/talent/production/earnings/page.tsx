'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  useProductionProfile,
  useMyProductionEarnings,
} from '@/hooks/solutions/use-production-portal';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface EarningsAssignment {
  id: string;
  earnings?: number;
  completed_at?: string;
  deliverable?: {
    title?: string;
  };
}

export default function ProductionEarningsPage() {
  const { profile, isLoading: authLoading } = useAuth();

  // Get production learner profile
  const { data: productionProfile, isLoading: profileLoading } = useProductionProfile(profile?.id || '');
  const learnerId = productionProfile?.id;

  // Get earnings
  const { data: earningsData, isLoading: earningsLoading } = useMyProductionEarnings(learnerId || '');

  const isLoading = authLoading || profileLoading || earningsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!productionProfile) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your production learner profile has not been set up yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // The hook returns { total, assignments } where assignments are completed work with earnings
  const assignments = (earningsData?.assignments || []) as EarningsAssignment[];
  const totalEarnings = earningsData?.total || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Earnings</h1>
        <p className="text-muted-foreground">
          Track your earnings from content production
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalEarnings)}</div>
            <p className="text-xs text-muted-foreground">
              From {assignments.length} completed deliverable(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Work</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignments.length}</div>
            <p className="text-xs text-muted-foreground">
              Deliverables with earnings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Earnings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Earnings History</CardTitle>
          <CardDescription>All earnings from your completed deliverables</CardDescription>
        </CardHeader>
        <CardContent>
          {assignments.length === 0 ? (
            <div className="text-center py-12">
              <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No earnings yet</h3>
              <p className="text-muted-foreground">
                Complete deliverables to start earning.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deliverable</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell className="font-medium">
                      {assignment.deliverable?.title || 'Deliverable'}
                    </TableCell>
                    <TableCell>
                      {assignment.completed_at
                        ? new Date(assignment.completed_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(assignment.earnings || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
