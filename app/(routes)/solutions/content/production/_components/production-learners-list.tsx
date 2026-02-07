'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  Users,
  Video,
  Palette,
  FileText,
  Wallet,
  AlertCircle,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import {
  useProductionLearners,
  useProductionLearnerStats,
} from '@/hooks/solutions/use-production-portal';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ProductionLearnersList() {
  const { data: learnersData, isLoading, error } = useProductionLearners({ limit: 100 });
  const { data: statsData, isLoading: statsLoading } = useProductionLearnerStats();

  const learners = learnersData?.data || [];

  const divisionConfig: Record<string, { icon: React.ElementType; color: string }> = {
    video: { icon: Video, color: 'text-blue-600' },
    design: { icon: Palette, color: 'text-purple-600' },
    writing: { icon: FileText, color: 'text-green-600' },
    animation: { icon: Video, color: 'text-orange-600' },
    social: { icon: Palette, color: 'text-pink-600' },
    other: { icon: FileText, color: 'text-gray-600' },
  };

  const levelConfig: Record<string, { label: string; color: string }> = {
    beginner: { label: 'Beginner', color: 'bg-gray-100 text-gray-800' },
    intermediate: { label: 'Intermediate', color: 'bg-blue-100 text-blue-800' },
    advanced: { label: 'Advanced', color: 'bg-green-100 text-green-800' },
    expert: { label: 'Expert', color: 'bg-purple-100 text-purple-800' },
  };

  // Calculate stats from real data
  const stats = {
    total: statsData?.total || learnersData?.metadata?.total || learners.length,
    active: statsData?.active || learners.filter((l) => l.is_active === true).length,
    totalOrders: learners.reduce((sum, l) => sum + (l.orders_completed || 0), 0),
    totalEarnings: learners.reduce((sum, l) => sum + (l.total_earnings || 0), 0),
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load production learners. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              {statsLoading && isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{stats.total}</p>
              )}
              <p className="text-sm text-muted-foreground">Total Learners</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Video className="h-8 w-8 text-blue-500" />
            <div>
              {statsLoading && isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{stats.active}</p>
              )}
              <p className="text-sm text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <FileText className="h-8 w-8 text-green-500" />
            <div>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              )}
              <p className="text-sm text-muted-foreground">Orders Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Wallet className="h-8 w-8 text-emerald-500" />
            <div>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{formatCurrency(stats.totalEarnings)}</p>
              )}
              <p className="text-sm text-muted-foreground">Total Paid</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Production Learners</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-16" />
                </div>
              ))}
            </div>
          ) : learners.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <UserPlus className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Learners Yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Add production learners to start assigning content work.
              </p>
              <Button asChild>
                <Link href="/solutions/content/production/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Learner
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Learner</TableHead>
                  <TableHead>Division</TableHead>
                  <TableHead>Skill Level</TableHead>
                  <TableHead className="text-center">Completed</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {learners.map((learner) => {
                  const division = divisionConfig[learner.division || 'other'];
                  const DivisionIcon = division?.icon || FileText;
                  const level = levelConfig[learner.skill_level] || levelConfig.beginner;

                  return (
                    <TableRow key={learner.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {learner.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{learner.name}</p>
                            {learner.email && (
                              <p className="text-sm text-muted-foreground">{learner.email}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DivisionIcon className={`h-4 w-4 ${division?.color}`} />
                          <span className="capitalize">{learner.division || 'N/A'}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={level.color}>{level.label}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {learner.orders_completed || 0}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(learner.total_earnings || 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={learner.is_active === true ? 'default' : 'secondary'}>
                          {learner.is_active === true ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
