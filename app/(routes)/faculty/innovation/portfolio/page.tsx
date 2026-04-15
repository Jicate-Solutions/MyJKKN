'use client';

// app/(routes)/faculty/innovation/portfolio/page.tsx
// Track My Portfolio — list of initiatives where the user is inventor
// (original or current). Filterable by status + category.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  FilePlus2,
  FilterX,
  Lightbulb,
  Search,
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useMyFacultyInitiatives } from '@/hooks/faculty-innovation/use-faculty-initiatives';
import {
  CATEGORY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  type FacultyInitiativeCategory,
  type FacultyInitiativeStatus,
} from '@/types/faculty-innovation';

export default function FacultyInnovationPortfolioPage() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('initiative');

  const [statusFilter, setStatusFilter] = useState<
    FacultyInitiativeStatus | 'all'
  >('all');
  const [categoryFilter, setCategoryFilter] = useState<
    FacultyInitiativeCategory | 'all'
  >('all');
  const [search, setSearch] = useState('');

  const filters = useMemo(
    () => ({
      status: statusFilter === 'all' ? undefined : statusFilter,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
      search: search.trim() || undefined,
      limit: 50,
    }),
    [statusFilter, categoryFilter, search]
  );

  const { initiatives, isLoading, total, isError, error } =
    useMyFacultyInitiatives(filters);

  const hasActiveFilters =
    statusFilter !== 'all' || categoryFilter !== 'all' || search.trim() !== '';

  const clearFilters = () => {
    setStatusFilter('all');
    setCategoryFilter('all');
    setSearch('');
  };

  return (
    <ContentLayout title="My Portfolio">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/faculty/innovation">Faculty Innovation</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>My Portfolio</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <PermissionGuard module="faculty_innovation" action="initiative.view_own">
        <div className="mt-6 space-y-6">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Lightbulb className="h-5 w-5 text-primary" /> My Initiatives
              </h2>
              <p className="text-sm text-muted-foreground">
                All initiatives where you are the inventor. Click any row for detail.
              </p>
            </div>
            <Button asChild>
              <Link href="/faculty/innovation/submit">
                <FilePlus2 className="mr-1 h-4 w-4" />
                Submit new initiative
              </Link>
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
              <CardDescription>
                Narrow by status, category, or search the title/abstract.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="relative md:col-span-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search title or abstract…"
                    className="pl-9"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(v) =>
                    setStatusFilter(v as FacultyInitiativeStatus | 'all')
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {(
                      Object.keys(STATUS_LABEL) as FacultyInitiativeStatus[]
                    ).map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) =>
                    setCategoryFilter(v as FacultyInitiativeCategory | 'all')
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {(
                      Object.keys(CATEGORY_LABEL) as FacultyInitiativeCategory[]
                    ).map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="mt-3">
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <FilterX className="mr-1 h-4 w-4" />
                    Clear filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Error state */}
          {isError && (
            <Alert variant="destructive">
              <AlertTitle>Could not load your portfolio</AlertTitle>
              <AlertDescription>
                {error?.message ?? 'An unknown error occurred.'}
              </AlertDescription>
            </Alert>
          )}

          {/* List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {isLoading ? 'Loading…' : `${total} initiative${total === 1 ? '' : 's'}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-14 animate-pulse rounded-md bg-muted/50"
                    />
                  ))}
                </div>
              ) : initiatives.length === 0 ? (
                <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
                  <p className="font-medium">No initiatives match.</p>
                  <p className="mt-1">
                    {hasActiveFilters ? (
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-primary underline"
                      >
                        Clear filters
                      </button>
                    ) : (
                      <Link
                        href="/faculty/innovation/submit"
                        className="text-primary underline"
                      >
                        Submit your first initiative
                      </Link>
                    )}
                    .
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {initiatives.map((init) => {
                      const isHighlighted = highlightId === init.id;
                      return (
                        <TableRow
                          key={init.id}
                          className={
                            isHighlighted
                              ? 'bg-primary/5 ring-1 ring-primary/30'
                              : ''
                          }
                        >
                          <TableCell className="max-w-md">
                            <div className="font-medium">{init.title}</div>
                            <div className="line-clamp-1 text-xs text-muted-foreground">
                              {init.abstract}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {CATEGORY_LABEL[init.category]}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLOR[init.status]}>
                              {STATUS_LABEL[init.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {init.approval_authority ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {init.submitted_at
                              ? new Date(init.submitted_at).toLocaleDateString()
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
