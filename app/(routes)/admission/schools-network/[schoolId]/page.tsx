'use client';

/**
 * Schools Network — School detail page.
 *
 * Tabs: Overview · Sessions · Contributions · Contacts · JKKN Owners.
 * Mirrors `app/(routes)/admission/consultants/[id]/page.tsx` shape.
 */

import { Suspense, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Edit,
  Gift,
  Handshake,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Users,
  UserCog,
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useTabParam } from '@/hooks/use-tab-param';

import {
  getSchoolDetail,
  listSchoolContributions,
  listSchoolLearners,
  listSchoolSessions,
  type SchoolLearnerRow,
} from '../_lib/api';
import {
  CONTRIBUTION_LABEL,
  OWNERSHIP_COLOR,
  OWNERSHIP_LABEL,
  OWNER_ROLE_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  formatInr,
} from '../_lib/types';

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SCHOOL_DETAIL_TABS = [
  'overview',
  'sessions',
  'contributions',
  'contacts',
  'owners',
  'learners'
] as const;

function SchoolDetailContent({ schoolId }: { schoolId: string }) {
  const [activeTab, setActiveTab] = useTabParam('overview', SCHOOL_DETAIL_TABS);
  const detailQuery = useQuery({
    queryKey: ['schools-network', 'detail', schoolId],
    queryFn: () => getSchoolDetail(schoolId),
  });

  const sessionsQuery = useQuery({
    queryKey: ['schools-network', 'sessions', schoolId],
    queryFn: () => listSchoolSessions(schoolId, 50),
    enabled: !!detailQuery.data,
  });

  const contribsQuery = useQuery({
    queryKey: ['schools-network', 'contributions', schoolId],
    queryFn: () => listSchoolContributions(schoolId, 50),
    enabled: !!detailQuery.data,
  });

  const [learnersPage, setLearnersPage] = useState(1);
  // Reset paging when the school changes. App Router reuses this component
  // across [schoolId] changes, so without this, paging deep in a large school
  // then opening a smaller one fetches a past-the-end offset — and a ≤25-learner
  // school (no pager) would show an unrecoverable empty roster (advisory review
  // MEDIUM). This is React's documented "adjust state during render" pattern.
  const [pagedSchoolId, setPagedSchoolId] = useState(schoolId);
  if (schoolId !== pagedSchoolId) {
    setPagedSchoolId(schoolId);
    setLearnersPage(1);
  }
  const learnersQuery = useQuery({
    queryKey: ['schools-network', 'learners', schoolId, learnersPage],
    queryFn: () =>
      listSchoolLearners(detailQuery.data!.school.name, {
        limit: 25,
        offset: (learnersPage - 1) * 25,
      }),
    enabled: !!detailQuery.data,
    // Keep prior data only across page-flips of the SAME school, so switching
    // schools doesn't briefly show the previous school's roster (advisory review).
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey?.[2] === schoolId ? prev : undefined,
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    if (detailQuery.error) {
      return (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">School not found</h3>
          <p className="text-muted-foreground mb-4">
            {(detailQuery.error as Error).message}
          </p>
          <Link href="/admission/schools-network">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Schools Network
            </Button>
          </Link>
        </div>
      );
    }
    return <DetailSkeleton />;
  }

  const { school, owners, contacts, recentSessions, contributionTotals } = detailQuery.data;

  const ownerNames = owners.filter((o) => o.isActive);
  const primaryContact = contacts.find((c) => c.isPrimary);

  const learnersTotal = learnersQuery.data?.total ?? 0;
  const learnersTotalPages = Math.max(1, Math.ceil(learnersTotal / 25));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold">{school.name}</h2>
            <Badge className={OWNERSHIP_COLOR[school.ownership]}>
              {OWNERSHIP_LABEL[school.ownership]}
            </Badge>
            <Badge className={STATUS_COLOR[school.status]}>
              {STATUS_LABEL[school.status]}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {[school.address, school.district, school.state, school.pincode]
              .filter(Boolean)
              .join(', ') || 'No address recorded'}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/admission/schools-network/${schoolId}/sessions/log`}>
            <PermissionGuard module="schools_network.sessions" action="create" fallback={null}>
              <Button>
                <CalendarIcon className="h-4 w-4 mr-2" /> Log Session
              </Button>
            </PermissionGuard>
          </Link>
          <PermissionGuard module="schools_network.schools" action="edit" fallback={null}>
            <Link href={`/admission/schools-network/${schoolId}/edit`}>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" /> Edit
              </Button>
            </Link>
          </PermissionGuard>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentSessions.length}</div>
            <p className="text-xs text-muted-foreground">
              Last:{' '}
              {recentSessions[0]
                ? formatDateOnly(recentSessions[0].conductedAt)
                : 'Never'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contributions</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatInr(contributionTotals.valueInr)}
            </div>
            <p className="text-xs text-muted-foreground">
              {contributionTotals.count} item{contributionTotals.count === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">JKKN Owners</CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ownerNames.length}</div>
            <p className="text-xs text-muted-foreground">
              {ownerNames.length === 0 ? 'Unassigned' : 'Active'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Primary Contact</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {primaryContact?.name ?? '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {primaryContact?.roleLabel ?? 'No contact yet'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sessions">
            Sessions ({sessionsQuery.data?.rows.length ?? recentSessions.length})
          </TabsTrigger>
          <TabsTrigger value="contributions">
            Contributions ({contribsQuery.data?.rows.length ?? contributionTotals.count})
          </TabsTrigger>
          <TabsTrigger value="contacts">
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="owners">
            JKKN Owners ({owners.length})
          </TabsTrigger>
          <TabsTrigger value="learners">
            Enrolled Learners{learnersQuery.data ? ` (${learnersQuery.data.total})` : ''}
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">School details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Ownership" value={OWNERSHIP_LABEL[school.ownership]} />
                <Row label="Status" value={STATUS_LABEL[school.status]} />
                <Row label="Intake year" value={school.intakeYear?.toString() ?? '—'} />
                <Row label="District" value={school.district ?? '—'} />
                <Row label="State" value={school.state ?? '—'} />
                <Row label="Pincode" value={school.pincode ?? '—'} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent sessions</CardTitle>
                <CardDescription>Last 10 visits / orientations / trainings</CardDescription>
              </CardHeader>
              <CardContent>
                {recentSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No sessions logged yet.{' '}
                    <Link
                      href={`/admission/schools-network/${schoolId}/sessions/log`}
                      className="text-primary hover:underline"
                    >
                      Log the first one →
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {recentSessions.slice(0, 10).map((s) => (
                      <li key={s.id} className="flex items-start gap-2">
                        <CalendarIcon className="h-3 w-3 mt-1 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium">{s.sessionTypeLabel ?? 'Session'}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(s.conductedAt)} ·{' '}
                            {s.attendeeCount} attendee{s.attendeeCount === 1 ? '' : 's'}
                          </div>
                          {s.topic && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {s.topic}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SESSIONS */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">All sessions</CardTitle>
                <CardDescription>Visits, orientations, training and informal contact</CardDescription>
              </div>
              <PermissionGuard module="schools_network.sessions" action="create" fallback={null}>
                <Link href={`/admission/schools-network/${schoolId}/sessions/log`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Log session
                  </Button>
                </Link>
              </PermissionGuard>
            </CardHeader>
            <CardContent>
              {sessionsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (sessionsQuery.data?.rows ?? recentSessions).length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No sessions logged for this school yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Conducted by</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Attendees</TableHead>
                      <TableHead>Topic</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(sessionsQuery.data?.rows ?? recentSessions).map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <Badge variant="secondary">
                            {s.sessionTypeLabel ?? s.sessionTypeCode}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(s.conductedAt)}</TableCell>
                        <TableCell>{s.conductedByName ?? '—'}</TableCell>
                        <TableCell>
                          {s.programPartnerName ? (
                            <Link
                              href={`/admission/schools-network/partners/${s.programPartnerId}`}
                              className="text-primary hover:underline"
                            >
                              {s.programPartnerName}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-right">{s.attendeeCount}</TableCell>
                        <TableCell className="max-w-xs truncate">{s.topic ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONTRIBUTIONS */}
        <TabsContent value="contributions">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">Contributions delivered</CardTitle>
                <CardDescription>Devices, branding, funds, training kits, etc.</CardDescription>
              </div>
              <PermissionGuard module="schools_network.contributions" action="create" fallback={null}>
                <Link href={`/admission/schools-network/${schoolId}/contributions/new`} className="shrink-0">
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Log contribution
                  </Button>
                </Link>
              </PermissionGuard>
            </CardHeader>
            <CardContent>
              {contribsQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (contribsQuery.data?.rows ?? []).length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No contributions logged yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kind</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Partner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(contribsQuery.data?.rows ?? []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Badge variant="secondary">{CONTRIBUTION_LABEL[c.kind]}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate">{c.description}</div>
                          {c.evidenceUrl && (
                            <a
                              href={c.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              View evidence
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{formatInr(c.valueInr)}</TableCell>
                        <TableCell>{formatDateOnly(c.deliveredAt)}</TableCell>
                        <TableCell>
                          {c.programPartnerName ? (
                            <Link
                              href={`/admission/schools-network/partners/${c.programPartnerId}`}
                              className="text-primary hover:underline"
                            >
                              {c.programPartnerName}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CONTACTS */}
        <TabsContent value="contacts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">School contacts</CardTitle>
                <CardDescription>HM, principal, teachers and alternates</CardDescription>
              </div>
              <PermissionGuard module="schools_network.contacts" action="create" fallback={null}>
                <Link href={`/admission/schools-network/${schoolId}/contacts/new`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Add contact
                  </Button>
                </Link>
              </PermissionGuard>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No contacts on file for this school yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Primary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {c.roleLabel ?? c.roleCode ?? '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {c.phone ? (
                            <a
                              href={`tel:${c.phone}`}
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <Phone className="h-3 w-3" /> {c.phone}
                            </a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <Mail className="h-3 w-3" /> {c.email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {c.isPrimary ? <Badge>Primary</Badge> : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* OWNERS */}
        <TabsContent value="owners">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">JKKN owners</CardTitle>
                <CardDescription>
                  Outreach coordinators and program leads assigned to this school
                </CardDescription>
              </div>
              <PermissionGuard module="schools_network.owners" action="manage" fallback={null}>
                <Link href={`/admission/schools-network/${schoolId}/owners/assign`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" /> Assign
                  </Button>
                </Link>
              </PermissionGuard>
            </CardHeader>
            <CardContent>
              {owners.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No JKKN owners assigned yet. An owner is the person inside JKKN
                  responsible for this school relationship.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Program partner</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {owners.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">
                          {o.jkknUserName ?? '—'}
                          {o.jkknUserEmail && (
                            <div className="text-xs text-muted-foreground">
                              {o.jkknUserEmail}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {OWNER_ROLE_LABEL[o.role]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {o.programPartnerName ? (
                            <Link
                              href={`/admission/schools-network/partners/${o.programPartnerId}`}
                              className="text-primary hover:underline"
                            >
                              {o.programPartnerName}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>{formatDateOnly(o.assignedAt)}</TableCell>
                        <TableCell>
                          {o.isActive ? <Badge>Active</Badge> : <Badge variant="outline">Revoked</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ENROLLED LEARNERS */}
        <TabsContent value="learners">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrolled learners</CardTitle>
              <CardDescription>
                Learners admitted to JKKN from this school
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Learners are matched across every spelling of this
                school&apos;s name. This is the combined undergraduate +
                postgraduate total — the discovery panel splits it into
                separate school (UG) and college (PG) sections, so each section
                shows a smaller per-level count. Institution-scoped staff see
                only their own institution&apos;s learners.
              </p>
              {learnersQuery.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (learnersQuery.data?.total ?? 0) === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No enrolled learners recorded from this school yet.
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Learner</TableHead>
                        <TableHead>Register No.</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Admission Year</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {learnersQuery.data?.rows.map((row: SchoolLearnerRow) => (
                        <TableRow key={row.learnerId}>
                          <TableCell className="font-medium">
                            {row.learnerName ?? '—'}
                          </TableCell>
                          <TableCell>{row.registerNumber ?? '—'}</TableCell>
                          <TableCell>{row.programName ?? '—'}</TableCell>
                          <TableCell>
                            {row.yearKnown ? (
                              row.admissionYear
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Year not recorded
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {learnersTotal > 25 && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Page {learnersPage} of{' '}
                        {learnersTotalPages.toLocaleString('en-IN')}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setLearnersPage((p) => Math.max(1, p - 1))
                          }
                          disabled={learnersPage <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setLearnersPage((p) =>
                              Math.min(learnersTotalPages, p + 1)
                            )
                          }
                          disabled={learnersPage >= learnersTotalPages}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export default function SchoolDetailPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params?.schoolId ?? '';

  return (
    <PermissionGuard module="schools_network.schools" action="view">
      <ContentLayout title="School Detail">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/schools-network">
                Schools Network
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Detail</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="mt-6">
          <Suspense fallback={null}>
            <SchoolDetailContent schoolId={schoolId} />
          </Suspense>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}
