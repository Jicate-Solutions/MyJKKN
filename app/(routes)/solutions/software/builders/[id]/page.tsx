'use client';

import { use } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  ArrowLeft,
  User,
  Mail,
  Building2,
  DollarSign,
  Code2,
  FolderKanban,
  Star,
  AlertCircle,
  Calendar,
  Briefcase,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { useBuilder } from '@/hooks/solutions/use-builders';

interface BuilderDetailPageProps {
  params: Promise<{ id: string }>;
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const assignmentStatusConfig: Record<string, { label: string; color: string }> = {
  requested: { label: 'Requested', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved', color: 'bg-blue-100 text-blue-800' },
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  completed: { label: 'Completed', color: 'bg-slate-100 text-slate-800' },
  withdrawn: { label: 'Withdrawn', color: 'bg-red-100 text-red-800' },
};

function ProficiencyBar({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3.5 w-3.5 ${
            star <= level
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export default function BuilderDetailPage({ params }: BuilderDetailPageProps) {
  const { id } = use(params);
  const { data: builder, isLoading, error } = useBuilder(id);

  if (isLoading) {
    return (
      <ContentLayout title="Builder Details">
        <div className="space-y-6 mt-4">
          <Skeleton className="h-12 w-96" />
          <div className="grid gap-4 md:grid-cols-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (error || !builder) {
    return (
      <ContentLayout title="Builder Details">
        <div className="space-y-6 mt-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error ? `Failed to load builder: ${error.message}` : 'Builder not found.'}
            </AlertDescription>
          </Alert>
          <Button variant="outline" asChild>
            <Link href="/solutions/software/builders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Builders
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const skills = builder.skills || [];
  const assignments = builder.assignments || [];
  const activeAssignments = assignments.filter(
    (a) => a.status === 'active' || a.status === 'approved' || a.status === 'requested'
  );
  const completedAssignments = assignments.filter((a) => a.status === 'completed');

  return (
    <ContentLayout title="Builder Details">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Solutions Hub', href: '/solutions' },
          { label: 'Software', href: '/solutions/software' },
          { label: 'Builders', href: '/solutions/software/builders' },
          { label: builder.name },
        ]}
      />
      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/solutions/software/builders">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg">
                {builder.name
                  ?.split(' ')
                  .map((n: string) => n[0])
                  .join('') || '?'}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl font-bold">{builder.name}</h1>
                <Badge variant={builder.is_active ? 'default' : 'secondary'}>
                  {builder.is_active ? 'Active' : 'Inactive'}
                </Badge>
                {builder.availability_status && (
                  <Badge variant="outline" className="capitalize">
                    {builder.availability_status}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {builder.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {builder.email}
                  </span>
                )}
                {builder.department && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {builder.department.department_name || builder.department.name}
                  </span>
                )}
                {builder.hourly_rate != null && builder.hourly_rate > 0 && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {formatCurrency(builder.hourly_rate)}/hr
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <DollarSign className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{formatCurrency(builder.total_earnings)}</p>
                <p className="text-sm text-muted-foreground">Total Earnings</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <FolderKanban className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{activeAssignments.length}</p>
                <p className="text-sm text-muted-foreground">Active Assignments</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <Code2 className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{skills.length}</p>
                <p className="text-sm text-muted-foreground">Skills</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 py-4">
              <TrendingUp className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">
                  {builder.average_rating ? `${builder.average_rating.toFixed(1)}/5` : '-'}
                </p>
                <p className="text-sm text-muted-foreground">Rating</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Builder Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Builder Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {builder.bio && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Bio</p>
                  <p className="text-sm">{builder.bio}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                {builder.specialization && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Specialization</p>
                    <p className="text-sm">{builder.specialization}</p>
                  </div>
                )}
                {builder.trained_date && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Trained Date
                    </p>
                    <p className="text-sm">{format(new Date(builder.trained_date), 'PPP')}</p>
                  </div>
                )}
                {builder.projects_completed != null && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                      <Briefcase className="h-3 w-3" /> Projects Completed
                    </p>
                    <p className="text-sm font-semibold">{builder.projects_completed}</p>
                  </div>
                )}
                {builder.builder_code && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Builder Code</p>
                    <p className="text-sm font-mono">{builder.builder_code}</p>
                  </div>
                )}
              </div>
              {(builder.portfolio_url || builder.github_url || builder.linkedin_url) && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Links</p>
                  <div className="flex flex-wrap gap-2">
                    {builder.portfolio_url && (
                      <a href={builder.portfolio_url} target="_blank" rel="noopener noreferrer">
                        <Badge variant="outline" className="cursor-pointer hover:bg-accent">Portfolio</Badge>
                      </a>
                    )}
                    {builder.github_url && (
                      <a href={builder.github_url} target="_blank" rel="noopener noreferrer">
                        <Badge variant="outline" className="cursor-pointer hover:bg-accent">GitHub</Badge>
                      </a>
                    )}
                    {builder.linkedin_url && (
                      <a href={builder.linkedin_url} target="_blank" rel="noopener noreferrer">
                        <Badge variant="outline" className="cursor-pointer hover:bg-accent">LinkedIn</Badge>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Skills
              </CardTitle>
              <CardDescription>{skills.length} skill{skills.length !== 1 ? 's' : ''} registered</CardDescription>
            </CardHeader>
            <CardContent>
              {skills.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Code2 className="mx-auto h-8 w-8 mb-2" />
                  <p className="text-sm">No skills registered yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {skills.map((skill) => (
                    <div
                      key={skill.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <p className="font-medium text-sm">{skill.skill_name}</p>
                        {skill.assessed_date && (
                          <p className="text-xs text-muted-foreground">
                            Assessed: {format(new Date(skill.assessed_date), 'dd MMM yyyy')}
                          </p>
                        )}
                      </div>
                      <ProficiencyBar level={skill.proficiency_level} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Active Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Assignments
            </CardTitle>
            <CardDescription>
              {activeAssignments.length} active, {completedAssignments.length} completed
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <FolderKanban className="mx-auto h-8 w-8 mb-2" />
                <p className="text-sm">No assignments yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phase</TableHead>
                    <TableHead>Solution</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => {
                    const statusInfo = assignmentStatusConfig[assignment.status] || {
                      label: assignment.status,
                      color: 'bg-gray-100 text-gray-800',
                    };
                    return (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          {assignment.phase ? (
                            <Link
                              href={`/solutions/software/phases/${assignment.phase.id}`}
                              className="font-medium hover:underline"
                            >
                              Phase {assignment.phase.phase_number}: {assignment.phase.title}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Unknown Phase</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {assignment.phase?.solution ? (
                            <span className="text-sm">
                              {assignment.phase.solution.solution_code} - {assignment.phase.solution.title}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {assignment.phase?.solution?.client?.name || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {assignment.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(assignment.phase?.estimated_value)}
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
    </ContentLayout>
  );
}
