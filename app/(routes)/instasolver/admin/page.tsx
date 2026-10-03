'use client';

import Link from 'next/link';
import { ArrowRight, FolderTree, Users } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminOverview, useInstaSolverAccess } from '@/hooks/instasolver/use-instasolver';
import { cn } from '@/lib/utils';

function Figure({
  label,
  value,
  loading,
  danger
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  danger?: boolean;
}) {
  return (
    <Card className={cn(danger && 'border-red-200 dark:border-red-900')}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading || value === undefined ? (
          <Skeleton className="mt-2 h-8 w-12" />
        ) : (
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function AdminOverview() {
  const { data: access } = useInstaSolverAccess();
  const { data, isLoading, error } = useAdminOverview();
  const showFailures = !!access?.is_admin;

  return (
    <div className="space-y-6">
      <PageBreadcrumb items={[{ label: 'InstaSolver', href: '/instasolver/dashboard' }, { label: 'Admin', isCurrent: true }]} />
      <PageHeader title="Admin" description="Maintenance teams, categories and how the module is being used" />

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            The figures could not be loaded. Refresh the page to try again.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Active teams" value={data?.teams_active} loading={isLoading} />
        <Figure label="Team members" value={data?.team_members} loading={isLoading} />
        <Figure label="Active categories" value={data?.categories_active} loading={isLoading} />
        {showFailures && (
          <Figure
            label="Notification failures, last 7 days"
            value={data?.notification_failures_7d}
            loading={isLoading}
            danger={!!data && data.notification_failures_7d > 0}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/instasolver/admin/teams" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="h-full transition-colors hover:bg-muted/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> Maintenance teams
                <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </CardTitle>
              <CardDescription>Create teams, choose the category each covers, and add team members.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        {access?.is_admin ? (
          <Link
            href="/instasolver/admin/categories"
            className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FolderTree className="h-4 w-4" /> Categories
                  <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription>The issue and requirement categories people choose from.</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : (
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderTree className="h-4 w-4" /> Categories
              </CardTitle>
              <CardDescription>Only the Super Admin can change categories.</CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Submissions by institution</CardTitle>
          <CardDescription>Issues and requirements raised at each institution</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !data?.submissions_by_institution.length ? (
            <p className="text-sm text-muted-foreground">Nothing has been submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Institution</TableHead>
                  <TableHead className="text-right">Issues</TableHead>
                  <TableHead className="text-right">Requirements</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.submissions_by_institution.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.issues}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.requirements}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 p-4 text-sm text-muted-foreground">
          <p>
            Users and roles are managed in MyJKKN&apos;s own user management, not here. InstaSolver reads them as they are.
          </p>
          <p>A Principal sees the institution on their own profile, and nothing beyond it.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AccessGate need="manager">
      <AdminOverview />
    </AccessGate>
  );
}
