'use client';

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryProject } from '@/hooks/industry';
import Link from 'next/link';
import { Target, Pencil, ArrowLeft, Building2, Users, Calendar, MapPin, Laptop, DollarSign } from 'lucide-react';
import type { ProjectStatus } from '@/types/industry';

const STATUS_COLORS: Record<ProjectStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  open: 'bg-green-100 text-green-800',
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-purple-100 text-purple-800',
  under_review: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800'
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: project, isLoading } = useIndustryProject(id);

  if (isLoading) return <ContentLayout title="Loading..."><Skeleton className="h-64 w-full" /></ContentLayout>;

  if (!project) {
    return (
      <ContentLayout title="Not Found">
        <div className="text-center py-12">
          <Target className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Project not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/projects')}>Back to Projects</Button>
        </div>
      </ContentLayout>
    );
  }

  // Extract competencies as displayable items (they are UUID arrays in the type)
  const requiredCompetencies = project.required_competencies || [];
  const deliverablesList = Array.isArray(project.deliverables) ? project.deliverables : [];

  return (
    <PermissionGuard module="industry.projects" action="view">
      <ContentLayout title={project.project_title}>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/projects">Projects</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{project.project_title}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
              <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{project.project_title}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={STATUS_COLORS[project.status]}>{project.status.replace('_', ' ')}</Badge>
                  {project.difficulty_level && <Badge variant="outline" className="capitalize">{project.difficulty_level}</Badge>}
                </div>
              </div>
            </div>
            <Button asChild><Link href={`/industry/projects/${id}/edit`}><Pencil className="h-4 w-4 mr-2" />Edit</Link></Button>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              {project.description && (
                <Card>
                  <CardHeader><CardTitle>Description</CardTitle></CardHeader>
                  <CardContent><p className="text-muted-foreground whitespace-pre-wrap">{project.description}</p></CardContent>
                </Card>
              )}
              {requiredCompetencies.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Required Competencies</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {requiredCompetencies.map((comp: string) => <Badge key={comp} variant="secondary">{comp}</Badge>)}
                    </div>
                  </CardContent>
                </Card>
              )}
              {deliverablesList.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Deliverables</CardTitle></CardHeader>
                  <CardContent>
                    <ul className="list-disc list-inside space-y-1">
                      {deliverablesList.map((d: any, i: number) => <li key={i} className="text-muted-foreground">{typeof d === 'string' ? d : JSON.stringify(d)}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Organization</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {project.partner && (
                    <Link href={`/industry/partners/${project.partner.id}`} className="flex items-center gap-2 hover:underline">
                      <Building2 className="h-4 w-4" />{(project.partner as any).company_name}
                    </Link>
                  )}
                  {project.mentor && (
                    <Link href={`/industry/mentors/${project.mentor.id}`} className="flex items-center gap-2 hover:underline">
                      <Users className="h-4 w-4" />{(project.mentor as any).mentor_name}
                    </Link>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {project.duration_weeks && <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{project.duration_weeks} weeks</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Team Size</span><span>{project.min_team_size || 1} - {project.max_team_size || 'Unlimited'}</span></div>
                  {project.stipend_amount && project.stipend_amount > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Stipend</span><span className="text-green-600 font-medium">{project.stipend_currency} {project.stipend_amount.toLocaleString()}</span></div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Timeline</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {project.application_deadline && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Apply By</span><span>{new Date(project.application_deadline).toLocaleDateString()}</span></div>
                  )}
                  {project.project_start_date && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Starts</span><span>{new Date(project.project_start_date).toLocaleDateString()}</span></div>
                  )}
                  {project.project_end_date && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Ends</span><span>{new Date(project.project_end_date).toLocaleDateString()}</span></div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
