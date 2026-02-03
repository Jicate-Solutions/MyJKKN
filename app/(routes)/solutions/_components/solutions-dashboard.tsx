'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import {
  Hammer,
  BookOpen,
  Video,
  DollarSign,
  Users,
  TrendingUp,
  Building2,
  FileText,
  Plus,
  ArrowRight,
} from 'lucide-react';

// TODO: Replace with real hooks after service migration
// import { useSolutionStats } from '@/hooks/solutions/use-solutions';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function SolutionsDashboard() {
  // Placeholder data until hooks are migrated
  const stats = {
    bySolutionType: {
      software: 12,
      training: 8,
      content: 15,
    },
    totalValue: 2500000,
    totalClients: 25,
    activeBuilders: 18,
    activeCohort: 12,
    productionLearners: 20,
  };
  const statsLoading = false;

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/solutions/new">
            <Plus className="mr-2 h-4 w-4" />
            New Solution
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/solutions/clients/new">
            <Building2 className="mr-2 h-4 w-4" />
            Add Client
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Software</CardTitle>
            <Hammer className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {stats?.bySolutionType.software || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Active solutions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Training</CardTitle>
            <BookOpen className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {stats?.bySolutionType.training || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Active programs</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Content</CardTitle>
            <Video className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">
                {stats?.bySolutionType.content || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Active orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold">
                {formatCurrency(stats?.totalValue || 0)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">All solutions</p>
          </CardContent>
        </Card>
      </div>

      {/* Module Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Software Module */}
        <Card className="hover:border-blue-300 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-blue-600" />
              Software Development
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Active Phases</p>
                <p className="text-lg font-semibold">24</p>
              </div>
              <div>
                <p className="text-muted-foreground">Builders</p>
                <p className="text-lg font-semibold">{stats.activeBuilders}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/software">
                  Overview
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/software/builders">Builders</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Training Module */}
        <Card className="hover:border-green-300 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-green-600" />
              Training Programs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Sessions</p>
                <p className="text-lg font-semibold">42</p>
              </div>
              <div>
                <p className="text-muted-foreground">Cohort</p>
                <p className="text-lg font-semibold">{stats.activeCohort}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/training">
                  Overview
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/training/cohort">Cohort</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Content Module */}
        <Card className="hover:border-purple-300 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-purple-600" />
              Content Production
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">In Queue</p>
                <p className="text-lg font-semibold">18</p>
              </div>
              <div>
                <p className="text-muted-foreground">Learners</p>
                <p className="text-lg font-semibold">{stats.productionLearners}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/content">
                  Overview
                  <ArrowRight className="ml-2 h-3 w-3" />
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/solutions/content/queue">Queue</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/list">
            <CardContent className="flex items-center gap-3 py-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">All Solutions</p>
                <p className="text-sm text-muted-foreground">View complete list</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/clients">
            <CardContent className="flex items-center gap-3 py-4">
              <Building2 className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Clients</p>
                <p className="text-sm text-muted-foreground">{stats.totalClients} total</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/payments">
            <CardContent className="flex items-center gap-3 py-4">
              <DollarSign className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Payments</p>
                <p className="text-sm text-muted-foreground">Track revenue</p>
              </div>
            </CardContent>
          </Link>
        </Card>

        <Card className="cursor-pointer hover:bg-muted/50 transition-colors">
          <Link href="/solutions/earnings">
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Earnings</p>
                <p className="text-sm text-muted-foreground">Revenue splits</p>
              </div>
            </CardContent>
          </Link>
        </Card>
      </div>
    </div>
  );
}
