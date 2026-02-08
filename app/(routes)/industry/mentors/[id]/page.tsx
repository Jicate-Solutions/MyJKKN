'use client';

import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useIndustryMentor } from '@/hooks/industry';
import Link from 'next/link';
import { Users, Pencil, Mail, Phone, Linkedin, ArrowLeft, Building2 } from 'lucide-react';

export default function MentorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: mentor, isLoading } = useIndustryMentor(id);

  if (isLoading) {
    return <ContentLayout title="Loading..."><Skeleton className="h-64 w-full" /></ContentLayout>;
  }

  if (!mentor) {
    return (
      <ContentLayout title="Not Found">
        <div className="text-center py-12">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-muted-foreground">Mentor not found</p>
          <Button className="mt-4" onClick={() => router.push('/industry/mentors')}>Back to Mentors</Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard module="industry.mentors" action="view">
      <ContentLayout title={mentor.mentor_name}>
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink href="/">Dashboard</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry">Industry Connect</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbLink href="/industry/mentors">Mentors</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{mentor.mentor_name}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">{mentor.mentor_name}</h2>
                <p className="text-muted-foreground">{mentor.designation}</p>
              </div>
            </div>
            <Button asChild><Link href={`/industry/mentors/${id}/edit`}><Pencil className="h-4 w-4 mr-2" />Edit</Link></Button>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="md:col-span-2 space-y-6">
              {mentor.bio && (
                <Card>
                  <CardHeader><CardTitle>About</CardTitle></CardHeader>
                  <CardContent><p className="text-muted-foreground whitespace-pre-wrap">{mentor.bio}</p></CardContent>
                </Card>
              )}
              <Card>
                <CardHeader><CardTitle>Expertise Areas</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {mentor.expertise_areas?.length > 0 ? mentor.expertise_areas.map((area) => (
                      <Badge key={area} variant="secondary">{area}</Badge>
                    )) : <p className="text-muted-foreground">No expertise areas specified</p>}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {mentor.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${mentor.email}`} className="text-primary hover:underline">{mentor.email}</a>
                    </div>
                  )}
                  {mentor.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{mentor.phone}</span>
                    </div>
                  )}
                  {mentor.linkedin_url && (
                    <div className="flex items-center gap-2">
                      <Linkedin className="h-4 w-4 text-muted-foreground" />
                      <a href={mentor.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">LinkedIn Profile</a>
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Organization</CardTitle></CardHeader>
                <CardContent>
                  {mentor.partner ? (
                    <Link href={`/industry/partners/${mentor.partner.id}`} className="flex items-center gap-2 hover:underline">
                      <Building2 className="h-4 w-4" />
                      {(mentor.partner as any).company_name}
                    </Link>
                  ) : <p className="text-muted-foreground">No organization</p>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Capacity</CardTitle></CardHeader>
                <CardContent>
                  <p>Max Mentees: <span className="font-medium">{mentor.max_mentees}</span></p>
                  <p>Current: <span className="font-medium">{mentor.current_mentees || 0}</span></p>
                  <p>Available Slots: <span className="font-medium text-green-600">{mentor.max_mentees - (mentor.current_mentees || 0)}</span></p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
