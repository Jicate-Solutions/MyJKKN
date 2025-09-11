'use client';

import { useState } from 'react';
import { Users, UserCheck, UserX, TrendingUp, ChevronDown, Building2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAttendanceStats } from '@/hooks/academic/use-attendance-dashboard';
import { cn } from '@/lib/utils';

interface Institution {
  id: string;
  name: string;
}

interface StatisticsCardsProps {
  userInstitutionId?: string;
  canViewAllInstitutions: boolean;
  institutions: Institution[];
}

interface StatCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number;
  className?: string;
  color?: 'default' | 'success' | 'warning' | 'destructive';
}

function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend, 
  className,
  color = 'default'
}: StatCardProps) {
  const colorClasses = {
    default: 'text-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    destructive: 'text-red-600 dark:text-red-400'
  };

  const bgClasses = {
    default: 'bg-muted/50',
    success: 'bg-green-50 dark:bg-green-950/20',
    warning: 'bg-yellow-50 dark:bg-yellow-950/20',
    destructive: 'bg-red-50 dark:bg-red-950/20'
  };

  return (
    <Card className={cn(bgClasses[color], className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", colorClasses[color])} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", colorClasses[color])}>
          {value.toLocaleString()}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}
        {trend !== undefined && (
          <div className="flex items-center mt-2">
            <TrendingUp className="h-3 w-3 mr-1 text-green-600" />
            <span className="text-xs text-green-600">+{trend}% from yesterday</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface HierarchicalStatsProps {
  stats: any[];
  canViewAllInstitutions: boolean;
}

function HierarchicalStats({ stats, canViewAllInstitutions }: HierarchicalStatsProps) {
  if (!stats || stats.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <p className="text-muted-foreground">No attendance data available for today</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {stats.map((institution) => (
        <Card key={institution.institution_id} className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {institution.name}
                </CardTitle>
                <CardDescription>
                  {institution.total_students} total students
                </CardDescription>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">
                  {institution.attendance_percentage}%
                </div>
                <div className="text-sm text-muted-foreground">
                  {institution.total_present} present, {institution.total_absent} absent
                </div>
              </div>
            </div>
            <Progress 
              value={institution.attendance_percentage} 
              className="h-2"
            />
          </CardHeader>
          
          {institution.departments && institution.departments.length > 0 && (
            <CardContent className="pt-0">
              <div className="space-y-3">
                {institution.departments.map((department: any) => (
                  <Collapsible key={department.department_id}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between p-2 h-auto">
                        <div className="flex items-center justify-between w-full">
                          <div className="text-left">
                            <div className="font-medium">{department.department_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {department.total_students} students
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="secondary"
                              className={cn(
                                department.attendance_percentage >= 80 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                                department.attendance_percentage >= 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                              )}
                            >
                              {department.attendance_percentage}%
                            </Badge>
                            <ChevronDown className="h-4 w-4" />
                          </div>
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 mt-2 ml-4">
                      {department.semesters.map((semester: any) => (
                        <div key={semester.semester_id} className="space-y-2">
                          <div className="flex items-center justify-between p-2 bg-muted/50 rounded">
                            <div>
                              <div className="font-medium text-sm">Semester {semester.semester_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {semester.total_students} students
                              </div>
                            </div>
                            <Badge variant="outline">
                              {semester.attendance_percentage}%
                            </Badge>
                          </div>
                          
                          {semester.sections && semester.sections.length > 0 && (
                            <div className="grid gap-2 ml-4">
                              {semester.sections.map((section: any) => (
                                <div key={section.section_id} className="flex items-center justify-between p-2 bg-background border rounded text-sm">
                                  <div>
                                    <span className="font-medium">Section {section.section_name}</span>
                                    <span className="text-muted-foreground ml-2">
                                      ({section.total_students} students)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-green-600">{section.present} present</span>
                                    <span className="text-red-600">{section.absent} absent</span>
                                    <Badge 
                                      variant="outline"
                                      className={cn(
                                        section.percentage >= 80 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                                        section.percentage >= 60 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                                      )}
                                    >
                                      {section.percentage}%
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

export function StatisticsCards({ 
  userInstitutionId, 
  canViewAllInstitutions, 
  institutions 
}: StatisticsCardsProps) {
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | undefined>(
    canViewAllInstitutions ? undefined : userInstitutionId
  );

  const { stats, isLoading, error, refetch } = useAttendanceStats(selectedInstitutionId);

  // Calculate aggregate stats across all institutions/selected institution
  const aggregateStats = stats.reduce((acc, institution) => {
    acc.totalStudents += institution.total_students;
    acc.totalPresent += institution.total_present;
    acc.totalAbsent += institution.total_absent;
    return acc;
  }, { totalStudents: 0, totalPresent: 0, totalAbsent: 0 });

  const overallPercentage = aggregateStats.totalStudents > 0 
    ? Math.round((aggregateStats.totalPresent / aggregateStats.totalStudents) * 100)
    : 0;

  const getAttendanceColor = (percentage: number) => {
    if (percentage >= 80) return 'success';
    if (percentage >= 60) return 'warning';
    return 'destructive';
  };

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-6">
          <div className="text-center space-y-2">
            <p className="text-destructive">Error loading attendance statistics</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Institution Filter for Super Admin */}
      {canViewAllInstitutions && institutions.length > 0 && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Filter by Institution</h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {selectedInstitutionId 
                  ? institutions.find(i => i.id === selectedInstitutionId)?.name
                  : 'All Institutions'
                }
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setSelectedInstitutionId(undefined)}>
                All Institutions
              </DropdownMenuItem>
              {institutions.map((institution) => (
                <DropdownMenuItem 
                  key={institution.id}
                  onClick={() => setSelectedInstitutionId(institution.id)}
                >
                  {institution.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Summary Stats Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-16 mb-1" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Students"
            value={aggregateStats.totalStudents}
            subtitle="Students enrolled today"
            icon={Users}
          />
          <StatCard
            title="Present"
            value={aggregateStats.totalPresent}
            subtitle="Students marked present"
            icon={UserCheck}
            color="success"
          />
          <StatCard
            title="Absent"
            value={aggregateStats.totalAbsent}
            subtitle="Students marked absent"
            icon={UserX}
            color="destructive"
          />
          <StatCard
            title="Attendance Rate"
            value={overallPercentage}
            subtitle="Overall percentage"
            icon={TrendingUp}
            color={getAttendanceColor(overallPercentage)}
          />
        </div>
      )}

      {/* Detailed Hierarchical View */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Detailed Breakdown</h3>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>
        
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="text-right space-y-1">
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                  <Skeleton className="h-2 w-full" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (
          <HierarchicalStats stats={stats} canViewAllInstitutions={canViewAllInstitutions} />
        )}
      </div>
    </div>
  );
}