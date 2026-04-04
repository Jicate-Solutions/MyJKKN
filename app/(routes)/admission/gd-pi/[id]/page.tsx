'use client';

export const dynamic = 'force-dynamic';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  ArrowLeft, Calendar, MapPin, Users, UserCheck, Award,
  CheckCircle2, XCircle, Clock, PlayCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useGDPISessionDetail, useGDPIMutations } from '@/hooks/admission/use-gdpi';
import type { GDPICandidate, GDPISessionStatus } from '@/types/admission';

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  scheduled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

const CANDIDATE_STATUS_ICON: Record<string, React.ReactNode> = {
  registered: <Clock className="h-3.5 w-3.5 text-gray-500" />,
  present: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
  absent: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  evaluated: <Award className="h-3.5 w-3.5 text-blue-600" />,
  disqualified: <XCircle className="h-3.5 w-3.5 text-red-700" />,
};

function SessionDetailContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { session, isLoading, isError } = useGDPISessionDetail(id);
  const { markAttendance, updateSession, publishResults } = useGDPIMutations();

  if (isLoading) {
    return (
      <ContentLayout title="GD-PI Session">
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (isError || !session) {
    return (
      <ContentLayout title="GD-PI Session">
        <div className="text-center py-12 text-muted-foreground">
          Session not found or an error occurred.
          <div className="mt-4">
            <Button variant="outline" onClick={() => router.push('/admission/gd-pi')}>
              Back to Sessions
            </Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  const handleAttendance = (candidateId: string, status: 'present' | 'absent') => {
    markAttendance.mutate({ sessionId: id, candidateId, status });
  };

  const handleStatusChange = (status: GDPISessionStatus) => {
    updateSession.mutate({ id, status });
  };

  const handlePublish = () => {
    publishResults.mutate(id);
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title={session.session_name}>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/gd-pi">GD-PI</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{session.session_name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => router.push('/admission/gd-pi')}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="flex items-center gap-2">
              {session.status === 'draft' && (
                <Button size="sm" onClick={() => handleStatusChange('scheduled')}>
                  <PlayCircle className="h-4 w-4 mr-1" /> Mark Scheduled
                </Button>
              )}
              {session.status === 'scheduled' && (
                <Button size="sm" onClick={() => handleStatusChange('in_progress')}>
                  <PlayCircle className="h-4 w-4 mr-1" /> Start Session
                </Button>
              )}
              {session.status === 'in_progress' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/admission/gd-pi/${id}/evaluate`)}>
                    <Award className="h-4 w-4 mr-1" /> Evaluate
                  </Button>
                  <Button size="sm" onClick={handlePublish}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Publish Results
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Session Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{format(new Date(session.scheduled_date), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-muted-foreground">
                      {session.start_time ? `${session.start_time.slice(0, 5)} - ${session.end_time?.slice(0, 5) || ''}` : 'Time TBD'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{session.venue || 'Venue TBD'}</p>
                    <p className="text-xs text-muted-foreground">Venue</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{session.candidates?.length || 0} / {session.max_candidates}</p>
                    <p className="text-xs text-muted-foreground">Candidates</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{session.evaluators?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Evaluators</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="candidates">
            <TabsList>
              <TabsTrigger value="candidates">
                Candidates ({session.candidates?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="evaluators">
                Evaluators ({session.evaluators?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="criteria">
                Scoring Criteria
              </TabsTrigger>
            </TabsList>

            {/* Candidates Tab */}
            <TabsContent value="candidates">
              <Card>
                <CardHeader>
                  <CardTitle>Candidates</CardTitle>
                  <CardDescription>
                    {session.status === 'completed' ? 'Final ranked results' : 'Registered candidates for this session'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {session.candidates && session.candidates.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {session.status === 'completed' && <TableHead className="w-16">Rank</TableHead>}
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Lead Score</TableHead>
                          <TableHead>Status</TableHead>
                          {session.status === 'completed' && <TableHead>GD-PI Score</TableHead>}
                          {['scheduled', 'in_progress'].includes(session.status) && (
                            <TableHead className="text-right">Attendance</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {session.candidates.map((candidate: GDPICandidate) => (
                          <TableRow key={candidate.id}>
                            {session.status === 'completed' && (
                              <TableCell className="font-bold text-center">
                                {candidate.rank ? `#${candidate.rank}` : '—'}
                              </TableCell>
                            )}
                            <TableCell className="font-medium">
                              {candidate.lead?.full_name || 'Unknown'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {candidate.lead?.phone || candidate.lead?.email || '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{candidate.lead?.score || 0}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {CANDIDATE_STATUS_ICON[candidate.status]}
                                <span className="text-sm capitalize">
                                  {candidate.status.replace('_', ' ')}
                                </span>
                              </div>
                            </TableCell>
                            {session.status === 'completed' && (
                              <TableCell>
                                <span className="font-medium">{candidate.percentage?.toFixed(1)}%</span>
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({candidate.total_score?.toFixed(1)}/{candidate.max_possible_score?.toFixed(1)})
                                </span>
                              </TableCell>
                            )}
                            {['scheduled', 'in_progress'].includes(session.status) && (
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant={candidate.status === 'present' ? 'default' : 'outline'}
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleAttendance(candidate.id, 'present')}
                                    disabled={markAttendance.isPending}
                                  >
                                    Present
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={candidate.status === 'absent' ? 'destructive' : 'outline'}
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleAttendance(candidate.id, 'absent')}
                                    disabled={markAttendance.isPending}
                                  >
                                    Absent
                                  </Button>
                                </div>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground">
                      No candidates added yet. Use the API to add leads as candidates.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Evaluators Tab */}
            <TabsContent value="evaluators">
              <Card>
                <CardHeader>
                  <CardTitle>Evaluators</CardTitle>
                  <CardDescription>Staff assigned to evaluate candidates</CardDescription>
                </CardHeader>
                <CardContent>
                  {session.evaluators && session.evaluators.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Evaluations</TableHead>
                          <TableHead>Lead Evaluator</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {session.evaluators.map((evaluator) => (
                          <TableRow key={evaluator.id}>
                            <TableCell className="font-medium">
                              {evaluator.evaluator?.full_name || 'Unknown'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {evaluator.evaluator?.email || '—'}
                            </TableCell>
                            <TableCell className="capitalize">
                              {evaluator.evaluator?.role || '—'}
                            </TableCell>
                            <TableCell>{evaluator.evaluation_count}</TableCell>
                            <TableCell>
                              {evaluator.is_lead_evaluator && (
                                <Badge variant="secondary">Lead</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center py-8 text-muted-foreground">
                      No evaluators assigned yet. Use the API to assign evaluators.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Scoring Criteria Tab */}
            <TabsContent value="criteria">
              <Card>
                <CardHeader>
                  <CardTitle>Scoring Criteria</CardTitle>
                  <CardDescription>Evaluation parameters for this session</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Criterion</TableHead>
                        <TableHead className="text-right">Max Score</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(session.scoring_criteria || []).map((criterion, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{criterion.name}</TableCell>
                          <TableCell className="text-right">{criterion.max_score}</TableCell>
                          <TableCell className="text-right">{criterion.weight}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function GDPISessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AdmissionErrorBoundary>
      <SessionDetailContent params={params} />
    </AdmissionErrorBoundary>
  );
}
