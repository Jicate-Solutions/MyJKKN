'use client';

// Course Events — /courses/[id] detail console (Phase 2a Task 7). Header +
// tab scaffold: Overview (read-only summary), Settings (CourseForm in edit
// mode, gated on courses.edit), and Packages/Sessions — disabled placeholders
// that Phase 2b and 2c will fill in. Rendered now, not omitted, so the shape
// of the console is legible and 2b/2c have an obvious insertion point.
//
// Tab state is URL-synced via useTabParam per the 2026-07-17 system standard
// for every tabbed page (deep-linkable + favoritable via ?tab=) — hence the
// Suspense wrapper at the bottom, which useTabParam requires because it reads
// useSearchParams().

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Building2, CalendarClock, CalendarDays, Hash, MapPin, Users } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTabParam } from '@/hooks/use-tab-param';
import { useCourseEvent, useUpdateCourseEvent } from '@/hooks/courses/use-course-events';
import type { CourseEventMode, CourseEventStatus, UpdateCourseEventDto } from '@/types/courses';
import {
  CourseForm,
  type CourseFormOutput,
} from '@/app/(routes)/courses/_components/course-form';

const COURSE_TABS = ['overview', 'settings', 'packages', 'sessions'] as const;

/** Status is a CHECK constraint, not a Postgres enum — mirrors
 *  _components/columns.tsx's own STATUS_LABEL/STATUS_VARIANT, which aren't
 *  exported from that file, so this is a small, deliberate duplicate rather
 *  than reaching into a sibling task's module for four lookup entries. */
const STATUS_LABEL: Record<CourseEventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<CourseEventStatus, string> = {
  draft: 'border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300',
  published:
    'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400',
  completed: 'border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-400',
  cancelled: 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-400',
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** A date range that collapses to one date when both ends match (or one is absent). */
const formatRange = (from: string | null | undefined, to: string | null | undefined) => {
  const a = formatDate(from);
  const b = formatDate(to);
  if (a && b) return a === b ? a : `${a} → ${b}`;
  return a ?? b ?? null;
};

/** timestamptz -> value for <input type="datetime-local"> (local wall time).
 *  Mirrors registration-schedule-card.tsx's toLocalInput; CourseForm's own
 *  toIso() (private to that file) is the inverse and runs again at submit. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** One labelled fact in the Overview grid. Renders a muted "Not set" rather
 *  than vanishing, so a missing value reads as data, not a broken layout. */
function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">
          {value || <span className="font-normal text-muted-foreground">Not set</span>}
        </p>
      </div>
    </div>
  );
}

/** Placeholder body for the Packages/Sessions tabs — reachable only via a
 *  direct `?tab=` URL, since their triggers carry `disabled`. That's
 *  deliberate: the trigger being unclickable already tells a browsing user
 *  the feature isn't here yet, while the panel stays as the literal
 *  insertion point 2b/2c swap real content into. */
function ComingSoonPanel({ note }: { note: string }) {
  return (
    <Card>
      <CardContent className="py-16 text-center text-sm text-muted-foreground">
        {note}
      </CardContent>
    </Card>
  );
}

function CourseDetailPageInner() {
  const params = useParams();
  const id = String(params?.id ?? '');
  const [activeTab, setActiveTab] = useTabParam('overview', COURSE_TABS);

  const { data: course, isLoading, isError } = useCourseEvent(id);
  const updateCourseEvent = useUpdateCourseEvent();

  const handleSubmit = (values: CourseFormOutput) => {
    // institution_id is deliberately dropped, not forwarded: UpdateCourseEventDto
    // is Partial<Omit<CreateCourseEventDto, 'institution_id'>> by design — an
    // edit must never move a course to a different institution, even though
    // CourseForm's institution field stays interactive (not disabled) in edit
    // mode. Stripping it here is what actually enforces that, not the type.
    const { institution_id: _institutionId, ...dto } = values;
    updateCourseEvent.mutate({ id, dto: dto as UpdateCourseEventDto });
  };

  if (isLoading) {
    return (
      <ContentLayout title="Course">
        <div className="mt-4 space-y-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </ContentLayout>
    );
  }

  if (isError || !course) {
    return (
      <ContentLayout title="Course">
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Courses', href: '/courses' },
            { label: 'Not found' },
          ]}
        />
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Course not found, or you don&apos;t have access to it.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/courses">Back to Courses</Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const status = course.status as CourseEventStatus;
  const dateLabel = formatRange(course.start_date, course.end_date);
  const applicationWindow = formatRange(
    course.application_opens_at,
    course.application_closes_at,
  );

  const defaultValues = {
    institution_id: course.institution_id,
    title: course.title,
    slug: course.slug,
    code: course.code ?? '',
    description: course.description ?? '',
    mode: course.mode as CourseEventMode,
    status,
    start_date: course.start_date ?? '',
    end_date: course.end_date ?? '',
    application_opens_at: toLocalInput(course.application_opens_at),
    application_closes_at: toLocalInput(course.application_closes_at),
    total_seats: course.total_seats ?? undefined,
    venue_text: course.venue_text ?? '',
  };

  return (
    <ContentLayout title={course.title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Courses', href: '/courses' },
          { label: course.title },
        ]}
      />

      <div className="mt-4 space-y-4">
        {/* Header — identity + status on the left, the at-a-glance facts on the right. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-bold">{course.title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] font-semibold ${STATUS_VARIANT[status] ?? ''}`}
              >
                {STATUS_LABEL[status] ?? status}
              </Badge>
              {course.code && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  {course.code}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />
              {course.institution?.name ?? 'Not set'}
            </span>
            {dateLabel && (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {dateLabel}
              </span>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="packages" disabled title="Coming in Phase 2b">
              Packages
            </TabsTrigger>
            <TabsTrigger value="sessions" disabled title="Coming in Phase 2c">
              Sessions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Course details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Fact icon={CalendarDays} label="Dates" value={dateLabel} />
                  <Fact
                    icon={CalendarClock}
                    label="Application window"
                    value={applicationWindow}
                  />
                  <Fact icon={MapPin} label="Venue" value={course.venue_text} />
                  <Fact icon={Building2} label="Institution" value={course.institution?.name} />
                  <Fact
                    icon={Users}
                    label="Seats"
                    value={course.total_seats ? String(course.total_seats) : 'Unlimited'}
                  />
                  <Fact icon={Hash} label="Mode" value={cap(course.mode)} />
                </div>

                {course.description && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="whitespace-pre-line text-sm">{course.description}</p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3.5 w-3.5" />
                    {course.slug}
                  </span>
                  {course.year && <span>Year {course.year}</span>}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <PermissionGuard
              module="courses"
              action="edit"
              fallback={
                <p className="py-8 text-center text-sm text-muted-foreground">
                  You don&apos;t have permission to edit this course.
                </p>
              }
            >
              <div className="max-w-3xl">
                <CourseForm
                  mode="edit"
                  defaultValues={defaultValues}
                  excludeId={course.id}
                  onSubmit={handleSubmit}
                  submitting={updateCourseEvent.isPending}
                />
              </div>
            </PermissionGuard>
          </TabsContent>

          <TabsContent value="packages">
            <ComingSoonPanel note="Course packages and instalment pricing — coming in Phase 2b." />
          </TabsContent>

          <TabsContent value="sessions">
            <ComingSoonPanel note="Sessions and venue booking — coming in Phase 2c." />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

export default function CourseDetailPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <Suspense fallback={null}>
      <CourseDetailPageInner />
    </Suspense>
  );
}
