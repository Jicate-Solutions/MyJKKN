'use client';

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryEngagement } from '@/hooks/industry';
import Link from 'next/link';
import { Briefcase, Pencil, ArrowLeft, Target, Users, Calendar, Clock, Star, Award, Building2 } from 'lucide-react';
import type { EngagementStatus } from '@/types/industry';

const STATUS_COLORS: Record<EngagementStatus, string> = {
  pending: 'bg-gray-100 text-gray-800',  // Legacy/alias
  applied: 'bg-gray-100 text-gray-800',
  approved: 'bg-yellow-100 text-yellow-800',
  active: 'bg-blue-100 text-blue-800',
  completed: 'bg-emerald-100 text-emerald-800',
  withdrawn: 'bg-orange-100 text-orange-800',
  terminated: 'bg-red-100 text-red-800'
};

export default function EngagementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: engagement, isLoading } = useIndustryEngagement(id);

  if (isLoading) return <ContentLayout title="Loading..."><Skeleton className="h-64 w-full" /></ContentLayout>;

  if (!engagement) {
    return (
      <ContentLayout title="Not Found">
        <div className="text-center py-12">
          <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Engagement not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/engagements')}>Back to Engagements</Button>
        </div>
      </ContentLayout>
    );
  }

  const project = engagement.project as any;
  const learner = engagement.learner as any;
  const mentor = engagement.mentor as any;
  const partner = engagement.partner as any;

  // Calculate a simple progress based on status
  const progressMap: Record<EngagementStatus, number> = {
    pending: 5,      // Legacy/alias
    applied: 5,
    approved: 20,
    active: 50,
    completed: 100,
    withdrawn: 0,
    terminated: 0
  };
  const progress = progressMap[engagement.status] ?? 0;

  return (
    <PermissionGuard module="industry.engagements" action="view">
      <ContentLayout title="Engagement Details">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/engagements">Engagements</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>Details</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
              <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{project?.project_title || `${engagement.engagement_type} Engagement`}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={STATUS_COLORS[engagement.status]}>{engagement.status}</Badge>
                  <Badge variant="outline" className="capitalize">{engagement.engagement_type}</Badge>
                </div>
              </div>
            </div>
            <Button asChild><Link href={`/industry/engagements/${id}/edit`}><Pencil className="h-4 w-4 mr-2" />Edit</Link></Button>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              <Card>
                <CardHeader><CardTitle>Progress & Hours</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status Progress</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <Progress value={progress} />
                  <div className="grid gap-4 md:grid-cols-2 pt-4">
                    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Hours Completed</p>
                        <p className="text-lg font-semibold">{engagement.hours_completed}</p>
                      </div>
                    </div>
                    {engagement.feedback?.mentor_feedback?.rating && (
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                        <Star className="h-5 w-5 text-yellow-500" />
                        <div>
                          <p className="text-sm text-muted-foreground">Mentor Rating</p>
                          <p className="text-lg font-semibold">{engagement.feedback.mentor_feedback.rating}/5</p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {engagement.competencies_demonstrated && engagement.competencies_demonstrated.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Demonstrated Competencies</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {engagement.competencies_demonstrated.map((comp: string, i: number) => (
                        <Badge key={i} variant="secondary" className="flex items-center gap-1">
                          <Award className="h-3 w-3" />{comp}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {engagement.feedback && (
                <Card>
                  <CardHeader><CardTitle>Feedback</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {engagement.feedback.mentor_feedback && (
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Mentor Feedback</span>
                          {engagement.feedback.mentor_feedback.date && (
                            <span className="text-sm text-muted-foreground">
                              {new Date(engagement.feedback.mentor_feedback.date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground">{engagement.feedback.mentor_feedback.comments}</p>
                        <Badge className="mt-2">{engagement.feedback.mentor_feedback.rating}/5</Badge>
                      </div>
                    )}
                    {engagement.feedback.learner_feedback && (
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Learner Feedback</span>
                          {engagement.feedback.learner_feedback.date && (
                            <span className="text-sm text-muted-foreground">
                              {new Date(engagement.feedback.learner_feedback.date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground">{engagement.feedback.learner_feedback.comments}</p>
                        <Badge className="mt-2">{engagement.feedback.learner_feedback.rating}/5</Badge>
                      </div>
                    )}
                    {engagement.feedback.supervisor_feedback && (
                      <div className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">Supervisor Feedback</span>
                          {engagement.feedback.supervisor_feedback.date && (
                            <span className="text-sm text-muted-foreground">
                              {new Date(engagement.feedback.supervisor_feedback.date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground">{engagement.feedback.supervisor_feedback.comments}</p>
                        <Badge className="mt-2">{engagement.feedback.supervisor_feedback.rating}/5</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {engagement.notes && (
                <Card>
                  <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">{engagement.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Learner</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {learner ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span>{learner.full_name || 'Unknown Learner'}</span>
                      </div>
                      {learner.roll_number && (
                        <p className="text-sm text-muted-foreground">{learner.roll_number}</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Learner ID: {engagement.learner_id}</p>
                  )}
                </CardContent>
              </Card>

              {project && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Project</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <Link href={`/industry/projects/${project.id}`} className="flex items-center gap-2 hover:underline">
                      <Target className="h-4 w-4 text-muted-foreground" />{project.project_title}
                    </Link>
                  </CardContent>
                </Card>
              )}

              {partner && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Industry Partner</CardTitle></CardHeader>
                  <CardContent>
                    <Link href={`/industry/partners/${partner.id}`} className="flex items-center gap-2 hover:underline">
                      <Building2 className="h-4 w-4 text-muted-foreground" />{partner.company_name}
                    </Link>
                  </CardContent>
                </Card>
              )}

              {mentor && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Mentor</CardTitle></CardHeader>
                  <CardContent>
                    <Link href={`/industry/mentors/${mentor.id}`} className="flex items-center gap-2 hover:underline">
                      <Users className="h-4 w-4 text-muted-foreground" />{mentor.mentor_name}
                    </Link>
                    {mentor.designation && (
                      <p className="text-sm text-muted-foreground mt-1">{mentor.designation}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {engagement.start_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Start Date</span>
                      <span>{new Date(engagement.start_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {engagement.expected_end_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expected End</span>
                      <span>{new Date(engagement.expected_end_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {engagement.end_date && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Actual End</span>
                      <span>{new Date(engagement.end_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {engagement.certificate_url && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Certificate</CardTitle></CardHeader>
                  <CardContent>
                    <Button variant="outline" className="w-full" asChild>
                      <a href={engagement.certificate_url} target="_blank" rel="noopener noreferrer">
                        <Award className="h-4 w-4 mr-2" />View Certificate
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
