'use client';

// app/(routes)/faculty/innovation/page.tsx
// Faculty Innovation Portfolio — landing page with 3 entry points.
// Week 1: Submit + Portfolio are live; Request Collab is a teaser (Week 2).

import Link from 'next/link';
import {
  Lightbulb,
  FilePlus2,
  FolderKanban,
  Users2,
  ArrowRight,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useMyFacultyInitiatives } from '@/hooks/faculty-innovation/use-faculty-initiatives';
import { STATUS_LABEL, STATUS_COLOR } from '@/types/faculty-innovation';

export default function FacultyInnovationLandingPage() {
  const { initiatives, isLoading } = useMyFacultyInitiatives({ limit: 3 });

  return (
    <ContentLayout title="Faculty Innovation">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Faculty Innovation</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PermissionGuard module="faculty_innovation" action="initiative.submit">
        <div className="mt-6 space-y-6">
          {/* Hero */}
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className="rounded-full bg-primary/10 p-3">
                  <Lightbulb className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-2xl">
                    Faculty Innovation Portfolio
                  </CardTitle>
                  <CardDescription className="mt-2 max-w-2xl">
                    Log your research initiatives, clinical prototypes, patent
                    filings and publications. Route requests to the right
                    approver (Director / Dean / IP Cell) and track every
                    initiative through the TRL lifecycle — from draft to
                    scaled program.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Three entry points */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="group cursor-pointer transition hover:border-primary hover:shadow-md">
              <Link href="/faculty/innovation/submit" className="block">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-emerald-100 p-2 text-emerald-700">
                      <FilePlus2 className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">Submit Initiative</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Log a new initiative: IP filing, clinical prototype,
                    research grant, or publication. Drafts auto-save every
                    30 seconds.
                  </p>
                  <div className="mt-4 flex items-center text-sm font-medium text-primary group-hover:underline">
                    Start submitting
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                </CardContent>
              </Link>
            </Card>

            <Card className="group cursor-pointer transition hover:border-primary hover:shadow-md">
              <Link href="/faculty/innovation/portfolio" className="block">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-indigo-100 p-2 text-indigo-700">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">My Portfolio</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Track all your initiatives by status, category, or
                    institution. See which are under review, approved, or
                    ready for resourcing.
                  </p>
                  <div className="mt-4 flex items-center text-sm font-medium text-primary group-hover:underline">
                    View portfolio
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                </CardContent>
              </Link>
            </Card>

            <Card className="group cursor-pointer transition hover:border-primary hover:shadow-md">
              <Link href="/faculty/innovation/collab-request" className="block">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="rounded-md bg-violet-100 p-2 text-violet-700">
                      <Users2 className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-lg">Request Collab</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Invite another JKKN college (e.g., Dental x Pharmacy) to
                    partner on your initiative. HOD + Dean + Director routing.
                  </p>
                  <div className="mt-4 flex items-center text-sm font-medium text-primary group-hover:underline">
                    Request collaboration
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </div>
                </CardContent>
              </Link>
            </Card>
          </div>

          {/* Recent activity preview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Initiatives</CardTitle>
              <CardDescription>
                Your 3 most recent submissions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : initiatives.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  <p>No initiatives yet.</p>
                  <p className="mt-1">
                    <Link
                      href="/faculty/innovation/submit"
                      className="text-primary underline"
                    >
                      Submit your first initiative
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <ul className="divide-y">
                  {initiatives.map((init) => (
                    <li key={init.id} className="flex items-center gap-3 py-3">
                      <div className="flex-1">
                        <p className="font-medium">{init.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {init.abstract}
                        </p>
                      </div>
                      <Badge className={STATUS_COLOR[init.status]}>
                        {STATUS_LABEL[init.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {initiatives.length > 0 && (
                <div className="mt-4">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/faculty/innovation/portfolio">
                      View all
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
