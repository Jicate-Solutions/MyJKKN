// app/(routes)/consultant-portal/page.tsx
// Consultant Portal Dashboard - Overview and quick stats

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/use-auth';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { ConsultantPortalDashboard, EducationConsultant } from '@/types/education-consultants';
import {
  Users,
  TrendingUp,
  IndianRupee,
  Award,
  ArrowRight,
  UserPlus,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const tierColors: Record<string, string> = {
  bronze: 'bg-amber-100 text-amber-800',
  silver: 'bg-gray-100 text-gray-800',
  gold: 'bg-yellow-100 text-yellow-800',
  platinum: 'bg-purple-100 text-purple-800',
  diamond: 'bg-cyan-100 text-cyan-800',
};

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  earned: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  clawed_back: 'bg-orange-100 text-orange-800',
};

export default function ConsultantPortalDashboardPage() {
  const { profile } = useAuth();
  const [dashboard, setDashboard] = useState<ConsultantPortalDashboard | null>(null);
  const [consultant, setConsultant] = useState<EducationConsultant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    if (!profile?.id || !profile?.institution_id) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // First get the consultant
      const consultants = await ConsultantService.getConsultants({
        institution_id: profile.institution_id,
        limit: 100,
      });

      const myConsultant = consultants.data.find((c) => c.referrer_user_id === profile.id);

      if (!myConsultant) {
        setError('No consultant profile found');
        return;
      }

      setConsultant(myConsultant);

      // Load portal dashboard
      const dashboardData = await ConsultantService.getConsultantPortalDashboard(myConsultant.id);
      setDashboard(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.institution_id]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h2 className="text-lg font-semibold mb-2">Unable to Load Dashboard</h2>
        <p className="text-muted-foreground mb-4">{error || 'Something went wrong'}</p>
        <Button onClick={loadDashboard}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  const { stats, recent_leads, recent_transactions } = dashboard;
  const progressToNextTier = stats.next_tier_threshold
    ? ((stats.total_conversions / stats.next_tier_threshold) * 100)
    : 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Welcome back, {consultant?.name}!</h1>
          <p className="text-muted-foreground">
            Track your leads, commissions, and performance
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href="/consultant-portal/leads/submit">
              <UserPlus className="h-4 w-4 mr-2" />
              Submit New Lead
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Leads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_leads}</div>
            <p className="text-xs text-muted-foreground">
              {stats.leads_this_month} this month
            </p>
          </CardContent>
        </Card>

        {/* Conversions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_conversions}</div>
            <p className="text-xs text-muted-foreground">
              {(stats.conversion_rate * 100).toFixed(1)}% conversion rate
            </p>
          </CardContent>
        </Card>

        {/* Total Earnings */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <IndianRupee className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.total_earnings)}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.pending_earnings)} pending
            </p>
          </CardContent>
        </Card>

        {/* Tier Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Tier</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={tierColors[stats.current_tier] || tierColors.bronze}>
                {stats.current_tier.charAt(0).toUpperCase() + stats.current_tier.slice(1)}
              </Badge>
            </div>
            {stats.leads_to_next_tier !== null && stats.leads_to_next_tier > 0 ? (
              <>
                <Progress value={progressToNextTier} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.leads_to_next_tier} more conversions to next tier
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Highest tier achieved!
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Leads */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Leads</CardTitle>
                <CardDescription>Your latest submitted leads</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/consultant-portal/leads">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recent_leads.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No leads submitted yet</p>
                <Button variant="link" asChild>
                  <Link href="/consultant-portal/leads/submit">
                    Submit your first lead
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recent_leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-background">
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(lead.submitted_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {lead.stage.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Commissions</CardTitle>
                <CardDescription>Your latest commission transactions</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/consultant-portal/commissions">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recent_transactions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <IndianRupee className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No commissions yet</p>
                <p className="text-xs">Commissions appear when your leads convert</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recent_transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-full ${
                          transaction.status === 'paid'
                            ? 'bg-green-100'
                            : transaction.status === 'approved'
                            ? 'bg-blue-100'
                            : 'bg-yellow-100'
                        }`}
                      >
                        {transaction.status === 'paid' ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : transaction.status === 'approved' ? (
                          <CheckCircle className="h-4 w-4 text-blue-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-yellow-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{transaction.lead_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(transaction.amount)}</p>
                      <Badge className={statusColors[transaction.status] || statusColors.pending}>
                        {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                      </Badge>
                    </div>
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
          <div className="grid gap-3 md:grid-cols-3">
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/consultant-portal/leads/submit">
                <UserPlus className="h-5 w-5" />
                <span>Submit New Lead</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/consultant-portal/commissions">
                <IndianRupee className="h-5 w-5" />
                <span>View Commission Statement</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
              <Link href="/consultant-portal/profile">
                <Award className="h-5 w-5" />
                <span>Update Profile</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
