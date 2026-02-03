'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileStack,
  Clock,
  CheckCircle,
  DollarSign,
  Star,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface LearnerStats {
  totalDeliverables: number;
  inProgress: number;
  inReview: number;
  approved: number;
  totalEarnings: number;
  avgRating: number | null;
  division: string;
}

export default function ProductionPortalPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [learner, setLearner] = useState<{ id: string; name: string; division: string } | null>(null);
  const [stats, setStats] = useState<LearnerStats | null>(null);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: learnerData } = await supabase
        .from('sh_production_learners')
        .select('id, name, division, total_earnings')
        .eq('user_id', user.id)
        .single();

      if (!learnerData) {
        setIsLoading(false);
        return;
      }

      setLearner(learnerData);

      // Get assignment counts
      const { data: assignments } = await supabase
        .from('sh_production_assignments')
        .select(`
          id, quality_rating,
          deliverable:sh_content_deliverables(status)
        `)
        .eq('learner_id', learnerData.id);

      const deliverables = assignments || [];
      const inProgress = deliverables.filter(a => (a.deliverable as any)?.status === 'in_progress').length;
      const inReview = deliverables.filter(a => (a.deliverable as any)?.status === 'review').length;
      const approved = deliverables.filter(a => (a.deliverable as any)?.status === 'approved').length;

      const ratingsWithValue = deliverables.filter(a => a.quality_rating != null);
      const avgRating = ratingsWithValue.length > 0
        ? ratingsWithValue.reduce((sum, a) => sum + (a.quality_rating || 0), 0) / ratingsWithValue.length
        : null;

      setStats({
        totalDeliverables: deliverables.length,
        inProgress,
        inReview,
        approved,
        totalEarnings: learnerData.total_earnings || 0,
        avgRating,
        division: learnerData.division,
      });

      setIsLoading(false);
    }

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!learner) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your production learner profile has not been set up yet.
                Please contact the production council to get started.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome, {learner.name?.split(' ')[0] || 'Learner'}
        </h1>
        <p className="text-muted-foreground">
          Your production dashboard and work queue
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Deliverables</CardTitle>
            <FileStack className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDeliverables || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.approved || 0} approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.inProgress || 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.inReview || 0} in review
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(stats?.totalEarnings || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              From completed work
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.avgRating ? stats.avgRating.toFixed(1) : 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">
              Quality score
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Division Badge */}
      <Card>
        <CardHeader>
          <CardTitle>Your Division</CardTitle>
          <CardDescription>Your specialized content area</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {stats?.division ? stats.division.charAt(0).toUpperCase() + stats.division.slice(1) : 'Not Assigned'}
          </Badge>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:border-primary transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-primary" />
              Available Work
            </CardTitle>
            <CardDescription>
              Browse and claim deliverables in your division
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/talent/production/queue">
                View Queue <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              My Work
            </CardTitle>
            <CardDescription>
              Track your assigned deliverables and submissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/talent/production/my-work">
                View My Work <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
