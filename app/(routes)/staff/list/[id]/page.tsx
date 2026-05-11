'use client';

// app/(routes)/staff/[id]/page.tsx


import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare, ArrowLeft, UserPlus } from 'lucide-react';
import type { Staff } from '@/types/staff';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ReactMarkdown from 'react-markdown';
import { StaffService } from '@/lib/services/staff/staff-service';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

interface StaffDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function StaffDetailsPage({ params }: StaffDetailsPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff | null>(null);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading]);

  // Fetch staff data after permissions are loaded
  useEffect(() => {
    if (!permissionsLoaded) return;

    const canViewStaff = isSuperAdmin || canAccess('staff', 'view');
    if (!canViewStaff) {
      router.push('/unauthorized');
      return;
    }

    async function fetchStaff() {
      try {
        setLoading(true);
        setError(null);
        const data = await StaffService.getStaffById(id);
        setStaff(data);
      } catch (err) {
        console.error('Error fetching staff:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch staff');
      } finally {
        setLoading(false);
      }
    }

    fetchStaff();
  }, [id, permissionsLoaded, isSuperAdmin, canAccess, router]);

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // Show loading when permissions or data are loading
  if (permissionsLoading || (loading && permissionsLoaded)) {
    return (
      <ContentLayout title='Employee Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' className='mr-2' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !staff) {
    return (
      <ContentLayout title='Employee Details'>
        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>
            {error || 'Staff member not found'}
          </p>
          <Button variant='outline' asChild>
            <Link href='/staff/list'>Back to Employees</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const canEditStaff = isSuperAdmin || canAccess('staff', 'edit');
  // R4.1 — internal mobility: show "Consider for New Role" to users who can create recruitment candidates
  const canCreateRecruitment = isSuperAdmin || canAccess('hr.recruitment', 'create');

  // Build the cross-profile URL for internal transfer pre-fill (R4.1)
  const considerForNewRoleUrl =
    `/hr/recruitment/submit?source_staff_id=${encodeURIComponent(staff.id)}` +
    `&source=internal_transfer` +
    `&name=${encodeURIComponent(`${staff.first_name} ${staff.last_name}`)}` +
    `&email=${encodeURIComponent(staff.institution_email || staff.email || '')}`;

  return (
    <ContentLayout title='Employee Details'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/staff/list'>Employees</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Employee Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        {/* Back Button */}

        <div className='flex justify-between items-center'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href='/staff/list' className='flex items-center gap-2'>
                <ArrowLeft className='h-4 w-4' />
              </Link>
            </Button>
            <div className='flex flex-col'>
              <h1 className='text-2xl font-bold py-1'>
                {staff.first_name} {staff.last_name}
              </h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Employee Details
              </p>
            </div>
          </div>
          <div className='flex items-center gap-2'>
            {/* R4.1 — Internal mobility entry point */}
            {canCreateRecruitment && (
              <Button variant='outline' asChild>
                <Link href={considerForNewRoleUrl}>
                  <UserPlus className='mr-2 h-4 w-4' />
                  Consider for New Role
                </Link>
              </Button>
            )}
            {canEditStaff ? (
              <Button asChild>
                <Link href={`/staff/list/${id}/edit`}>
                  <PenSquare className='mr-2 h-4 w-4' />
                  Edit Employee
                </Link>
              </Button>
            ) : (
              <Button variant='outline' disabled className='opacity-50'>
                <PenSquare className='mr-2 h-4 w-4' />
                Edit Employee
              </Button>
            )}
          </div>
        </div>

        {/* Profile Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Overview</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex items-center gap-4'>
              <Avatar className='h-20 w-20'>
                <AvatarImage src={staff.profile_picture || undefined} />
                <AvatarFallback className='text-lg'>
                  {getInitials(staff.first_name, staff.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <h2 className='text-xl font-semibold'>
                    {staff.first_name} {staff.last_name}
                  </h2>
                  <Badge variant={staff.is_active ? 'default' : 'secondary'}>
                    {staff.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className='text-lg font-semibold text-primary'>
                  {staff.designation}
                </p>
                <p className='text-sm text-muted-foreground'>
                  Staff ID: {staff.staff_id || 'Not Assigned'}
                </p>
                <Link
                  href={`mailto:${staff.institution_email}`}
                  className='text-sm text-muted-foreground hover:text-primary'
                >
                  {staff.institution_email || 'Not Assigned'}
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Gender</p>
              <p className='text-base text-muted-foreground capitalize'>
                {staff.gender}
              </p>
            </div>
            <div>
              <p className='font-medium'>Date of Birth</p>
              <p className='text-base text-muted-foreground'>
                {format(new Date(staff.date_of_birth), 'PPP')}
              </p>
            </div>
            <div>
              <p className='font-medium'>Marital Status</p>
              <p className='text-base text-muted-foreground capitalize'>
                {staff.marital_status}
              </p>
            </div>
            <div>
              <p className='font-medium'>Blood Group</p>
              <p className='text-base text-muted-foreground'>
                {staff.blood_group || 'Not Specified'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Personal Email</p>
              <p className='text-base text-muted-foreground'>{staff.email}</p>
            </div>
            <div>
              <p className='font-medium'>Phone</p>
              <p className='text-base text-muted-foreground'>{staff.phone}</p>
            </div>
            <div>
              <p className='font-medium'>Address</p>
              <p className='text-base text-muted-foreground'>
                {staff.address || 'Not Specified'}
              </p>
            </div>
            <div>
              <p className='font-medium'>Location</p>
              <p className='text-base text-muted-foreground'>
                {[staff.district, staff.state, staff.pincode]
                  .filter(Boolean)
                  .join(', ') || 'Not Specified'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Employment Information */}
        <Card>
          <CardHeader>
            <CardTitle>Employment Information</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-2'>
            <div>
              <p className='font-medium'>Date of Joining</p>
              <p className='text-base text-muted-foreground'>
                {format(new Date(staff.date_of_joining), 'PPP')}
              </p>
            </div>
            <div>
              <p className='font-medium'>Category</p>
              <p className='text-base text-muted-foreground'>
                {staff.category?.category_name}
              </p>
            </div>
            <div>
              <p className='font-medium'>Institution</p>
              <p className='text-base text-muted-foreground'>
                {staff.institution?.name}
              </p>
            </div>
            <div>
              <p className='font-medium'>Department</p>
              <p className='text-base text-muted-foreground'>
                {staff.department?.department_name}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Extended Profile (faculty-only, conditional) */}
        {staff.has_extended_profile && (
          <Card>
            <CardHeader>
              <CardTitle>Extended Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue='academic'>
                <TabsList className='flex-wrap h-auto'>
                  <TabsTrigger value='academic'>Academic</TabsTrigger>
                  <TabsTrigger value='experience'>Experience</TabsTrigger>
                  <TabsTrigger value='research'>Research</TabsTrigger>
                  <TabsTrigger value='achievements'>Achievements</TabsTrigger>
                  <TabsTrigger value='mentoring'>Mentoring</TabsTrigger>
                  <TabsTrigger value='faqs'>FAQs</TabsTrigger>
                </TabsList>

                <TabsContent value='academic'>
                  {staff.qualification_summary && (
                    <div className='prose prose-sm mb-4'>
                      <ReactMarkdown>{staff.qualification_summary}</ReactMarkdown>
                    </div>
                  )}
                  <ReadOnlyList
                    title='Qualifications'
                    items={staff.qualifications ?? []}
                    renderItem={(q: any) =>
                      `${q.degree} — ${q.institution} (${q.year})`
                    }
                  />
                  <ReadOnlyList
                    title='Specialisations'
                    items={staff.specialisations ?? []}
                    renderItem={(s: any) => s.name}
                  />
                </TabsContent>

                <TabsContent value='experience'>
                  <p className='text-sm text-muted-foreground mb-3'>
                    {staff.experience_years} years total
                  </p>
                  <ReadOnlyList
                    title='Experience'
                    items={staff.experience_entries ?? []}
                    renderItem={(e: any) =>
                      `${e.role} @ ${e.organisation} (${e.from} – ${e.to ?? 'present'})`
                    }
                  />
                  {staff.professional_summary && (
                    <div className='prose prose-sm mt-4'>
                      <ReactMarkdown>{staff.professional_summary}</ReactMarkdown>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value='research'>
                  <p className='text-sm text-muted-foreground mb-3'>
                    {staff.research_papers} research papers
                  </p>
                  <ReadOnlyList
                    title='Publications'
                    items={staff.publications ?? []}
                    renderItem={(p: any) => `${p.title} (${p.year ?? '—'})`}
                  />
                  <ReadOnlyList
                    title='Research Focus'
                    items={staff.research_focus_areas ?? []}
                    renderItem={(r: any) => r.area}
                  />
                  <ReadOnlyList
                    title='Funded Projects'
                    items={staff.funded_projects ?? []}
                    renderItem={(f: any) => `${f.title} — ${f.agency ?? '—'}`}
                  />
                  <div className='mt-3 flex gap-3 text-sm'>
                    {staff.google_scholar_url && (
                      <a
                        className='underline'
                        href={staff.google_scholar_url}
                        target='_blank'
                        rel='noreferrer'
                      >
                        Google Scholar
                      </a>
                    )}
                    {staff.researchgate_url && (
                      <a
                        className='underline'
                        href={staff.researchgate_url}
                        target='_blank'
                        rel='noreferrer'
                      >
                        ResearchGate
                      </a>
                    )}
                    {staff.orcid_url && (
                      <a
                        className='underline'
                        href={staff.orcid_url}
                        target='_blank'
                        rel='noreferrer'
                      >
                        ORCID
                      </a>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value='achievements'>
                  <p className='text-sm text-muted-foreground mb-3'>
                    {staff.awards_won} awards won
                  </p>
                  <ReadOnlyList
                    title='Badges'
                    items={staff.badges ?? []}
                    renderItem={(b: any) => b.label}
                  />
                  <ReadOnlyList
                    title='Awards'
                    items={staff.awards ?? []}
                    renderItem={(a: any) => `${a.title} (${a.year ?? '—'})`}
                  />
                  <ReadOnlyList
                    title='Certifications'
                    items={staff.certifications ?? []}
                    renderItem={(c: any) => c.name}
                  />
                  <ReadOnlyList
                    title='Memberships'
                    items={staff.memberships ?? []}
                    renderItem={(m: any) =>
                      `${m.body}${m.role ? ' (' + m.role + ')' : ''}`
                    }
                  />
                  <ReadOnlyList
                    title='Achievements'
                    items={staff.achievements ?? []}
                    renderItem={(a: any) => a.title}
                  />
                </TabsContent>

                <TabsContent value='mentoring'>
                  {staff.mentoring_description && (
                    <div className='prose prose-sm mb-4'>
                      <ReactMarkdown>{staff.mentoring_description}</ReactMarkdown>
                    </div>
                  )}
                  <p className='text-sm'>
                    PhD scholars: {staff.phd_scholars} | PG:{' '}
                    {staff.pg_dissertations_guided} | UG:{' '}
                    {staff.ug_projects_guided}
                  </p>
                  <ReadOnlyList
                    title='PhD Scholars'
                    items={staff.phd_scholars_list ?? []}
                    renderItem={(s: any) =>
                      `${s.name}${s.topic ? ' — ' + s.topic : ''}`
                    }
                  />
                </TabsContent>

                <TabsContent value='faqs'>
                  {(staff.faqs ?? []).map((q: any, i: number) => (
                    <div key={i} className='mb-4'>
                      <p className='font-semibold'>{q.question}</p>
                      <p className='text-sm'>{q.answer}</p>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}

function ReadOnlyList<T>({
  title,
  items,
  renderItem
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => React.ReactNode;
}) {
  if (!items?.length) return null;
  return (
    <div className='mb-4'>
      <h3 className='font-semibold text-sm mb-2'>{title}</h3>
      <ul className='list-disc pl-5 space-y-1 text-sm'>
        {items.map((it, i) => (
          <li key={i}>{renderItem(it)}</li>
        ))}
      </ul>
    </div>
  );
}
