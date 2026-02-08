'use client';

// ============================================================================
// Industry Partner Detail Page
// View details of a single industry partner
// ============================================================================

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryPartner, useMentorsByPartner, useProjectsByPartner } from '@/hooks/industry';
import Link from 'next/link';
import {
  Building2,
  Pencil,
  ExternalLink,
  Mail,
  Phone,
  Calendar,
  FileText,
  Users,
  Target,
  ArrowLeft
} from 'lucide-react';

export default function PartnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: partner, isLoading } = useIndustryPartner(id);
  const { data: mentors } = useMentorsByPartner(id);
  const { data: projects } = useProjectsByPartner(id);

  if (isLoading) {
    return (
      <ContentLayout title="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (!partner) {
    return (
      <ContentLayout title="Partner Not Found">
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Partner not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/partners')}>
            Back to Partners
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module="industry.partners" action="view">
      <ContentLayout title={partner.company_name}>
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/industry/partners">Partners</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{partner.company_name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{partner.company_name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {partner.industry_sector && (
                    <span className="text-muted-foreground">{partner.industry_sector}</span>
                  )}
                  <Badge className={partner.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                    {partner.is_active ? 'Active' : 'Archived'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {partner.website_url && (
                <Button variant="outline" asChild>
                  <a href={partner.website_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Website
                  </a>
                </Button>
              )}
              <Button asChild>
                <Link href={`/industry/partners/${id}/edit`}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Main Info */}
            <div className="md:col-span-2 space-y-6">
              {/* Description */}
              {partner.description && (
                <Card>
                  <CardHeader>
                    <CardTitle>About</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground whitespace-pre-wrap">{partner.description}</p>
                  </CardContent>
                </Card>
              )}

              {/* Mentors */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Industry Mentors</CardTitle>
                    <CardDescription>Mentors from this organization</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/industry/mentors/new?partner_id=${id}`}>
                      Add Mentor
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {mentors && mentors.length > 0 ? (
                    <div className="space-y-3">
                      {mentors.map((mentor) => (
                        <div
                          key={mentor.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{mentor.mentor_name}</p>
                              <p className="text-sm text-muted-foreground">{mentor.designation}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/industry/mentors/${mentor.id}`}>View</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">No mentors yet</p>
                  )}
                </CardContent>
              </Card>

              {/* Projects */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Industry Projects</CardTitle>
                    <CardDescription>Projects from this organization</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/industry/projects/new?partner_id=${id}`}>
                      Add Project
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  {projects && projects.length > 0 ? (
                    <div className="space-y-3">
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Target className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{project.project_title}</p>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={
                                    project.status === 'open' ? 'bg-green-100 text-green-800' :
                                    project.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                    'bg-gray-100 text-gray-800'
                                  }
                                >
                                  {project.status.replace('_', ' ')}
                                </Badge>
                                {project.difficulty_level && (
                                  <span className="text-sm text-muted-foreground capitalize">
                                    {project.difficulty_level}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/industry/projects/${project.id}`}>View</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">No projects yet</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Contact Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {partner.contact_person && (
                    <div>
                      <p className="text-sm text-muted-foreground">Contact Person</p>
                      <p className="font-medium">{partner.contact_person}</p>
                    </div>
                  )}
                  {partner.contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`mailto:${partner.contact_email}`}
                        className="text-primary hover:underline"
                      >
                        {partner.contact_email}
                      </a>
                    </div>
                  )}
                  {partner.contact_phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`tel:${partner.contact_phone}`}
                        className="text-primary hover:underline"
                      >
                        {partner.contact_phone}
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Partnership Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Partnership Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {partner.partnership_type && (
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <Badge variant="outline" className="capitalize">
                        {partner.partnership_type.replace('_', ' ')}
                      </Badge>
                    </div>
                  )}
                  {partner.partnership_start_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Started</p>
                        <p>{new Date(partner.partnership_start_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  )}
                  {partner.partnership_end_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Ends</p>
                        <p>{new Date(partner.partnership_end_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  )}
                  {partner.mou_document_url && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={partner.mou_document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        View MOU Document
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mentors</span>
                    <span className="font-medium">{mentors?.length || 0}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Projects</span>
                    <span className="font-medium">{projects?.length || 0}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
