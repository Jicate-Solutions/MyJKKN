'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Users, Star, GraduationCap, Wallet, AlertCircle } from 'lucide-react';
import {
  useCohortMembers,
  useCohortMemberStats,
  getLevelInfo,
  getTrackDisplayLabel,
  LEVEL_COLORS,
} from '@/hooks/solutions/use-training';
import { formatCurrency } from '@/lib/services/solutions';

export function CohortList() {
  const { data: membersData, isLoading: membersLoading, error: membersError } = useCohortMembers({ limit: 50 });
  const { data: stats, isLoading: statsLoading } = useCohortMemberStats();

  const members = membersData?.data || [];
  const isLoading = membersLoading || statsLoading;

  if (membersError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load cohort members. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Total Members</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Star className="h-8 w-8 text-purple-500" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{stats?.byLevel?.['master'] || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Masters</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <GraduationCap className="h-8 w-8 text-green-500" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">{stats?.byLevel?.[2] || 0}</p>
              )}
              <p className="text-sm text-muted-foreground">Leads</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <Wallet className="h-8 w-8 text-emerald-500" />
            <div>
              {statsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold">
                  {formatCurrency(
                    members.reduce((sum, m) => sum + (m.total_earnings || 0), 0)
                  )}
                </p>
              )}
              <p className="text-sm text-muted-foreground">Total Paid</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Cohort Members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {membersLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Cohort Members Yet</h3>
              <p className="text-sm text-muted-foreground">
                Add members to the training cohort to get started.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-center">Sessions Led</TableHead>
                  <TableHead className="text-right">Earnings</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const levelInfo = getLevelInfo(member.level || 0);
                  const levelColor = LEVEL_COLORS[member.level || 0] || 'bg-gray-100 text-gray-800';
                  const trackLabel = getTrackDisplayLabel(member.track || null);
                  const deptName = (member as any).department?.name || '-';

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>
                              {member.name
                                .split(' ')
                                .map((n: string) => n[0])
                                .join('')
                                .toUpperCase()
                                .slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {member.email || '-'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{deptName}</TableCell>
                      <TableCell>{trackLabel}</TableCell>
                      <TableCell>
                        <Badge className={levelColor}>{levelInfo.title}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div>
                          <span className="font-medium">{member.sessions_led || 0}</span>
                          <span className="text-muted-foreground"> led, </span>
                          <span>{member.sessions_co_led || 0}</span>
                          <span className="text-muted-foreground"> co-led</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(member.total_earnings || 0)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.status === 'active' ? 'default' : 'secondary'}>
                          {member.status === 'active' ? 'Active' : member.status || 'Unknown'}
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
    </div>
  );
}
