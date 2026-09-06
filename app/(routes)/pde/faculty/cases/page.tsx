'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useFacultyCases } from '@/hooks/pde/use-faculty-cases';
import { BeatLoader } from 'react-spinners';
import { Plus, FileText, Search, Stethoscope } from 'lucide-react';
import type { ClinicalCase, ClinicalCaseStatus } from '@/types/pde';

type StatusFilter = ClinicalCaseStatus | 'all';

function StatusBadge({ status }: { status: ClinicalCaseStatus }) {
  if (status === 'published') {
    return <Badge className="bg-green-500/10 text-green-600 border-green-200">Published</Badge>;
  }
  if (status === 'draft') {
    return <Badge variant="outline">Draft</Badge>;
  }
  return <Badge variant="secondary">Archived</Badge>;
}

export default function FacultyClinicalCasesPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useFacultyCases({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const cases = data?.data || [];

  const cohorts = useMemo(() => {
    const map = new Map<string, { id: string; code?: string; name?: string; count: number }>();
    cases.forEach((c: ClinicalCase) => {
      const entry = map.get(c.course_id) || {
        id: c.course_id,
        code: c.course_code,
        name: c.course_name,
        count: 0,
      };
      entry.count += 1;
      map.set(c.course_id, entry);
    });
    return Array.from(map.values()).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  }, [cases]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cases.filter((c: ClinicalCase) => {
      if (courseFilter !== 'all' && c.course_id !== courseFilter) return false;
      if (!term) return true;
      return (
        c.title.toLowerCase().includes(term) ||
        (c.course_code || '').toLowerCase().includes(term) ||
        (c.course_name || '').toLowerCase().includes(term)
      );
    });
  }, [cases, search, courseFilter]);

  const filtersActive =
    statusFilter !== 'all' || courseFilter !== 'all' || search.trim() !== '';

  const clearFilters = () => {
    setStatusFilter('all');
    setCourseFilter('all');
    setSearch('');
  };

  return (
    <ContentLayout title="Clinical Cases">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Clinical Cases' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
              Clinical Cases
            </h1>
            <p className="text-sm text-muted-foreground">
              Author and manage AI case-based learning experiences. Cases progress through
              draft → published → archived lifecycle.
            </p>
          </div>
          <Button asChild className="bg-[#0b6d41] hover:bg-[#0b6d41]/90">
            <Link href="/pde/faculty/cases/new">
              <Plus className="mr-2 h-4 w-4" />
              New Case
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or course code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="w-full md:w-[260px]">
                <SelectValue placeholder="Cohort / course" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cohorts</SelectItem>
                {cohorts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code ? `${c.code} — ${c.name}` : c.name || c.id} ({c.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Result count + clear filters */}
        {!isLoading && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1 text-sm text-muted-foreground">
            <span>
              Showing <span className="font-medium text-foreground">{filtered.length}</span> of{' '}
              <span className="font-medium text-foreground">{cases.length}</span>{' '}
              case{cases.length !== 1 ? 's' : ''}
              {filtersActive ? ' (filtered)' : ''}
            </span>
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 shrink-0">
                Clear filters
              </Button>
            )}
          </div>
        )}

        {/* Cases Table */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#0b6d41" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Stethoscope className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground mb-4">
                  {cases.length === 0
                    ? 'No clinical cases yet. Create your first case to get started.'
                    : 'No cases match your filters.'}
                </p>
                <Button asChild variant="outline">
                  <Link href="/pde/faculty/cases/new">
                    <Plus className="mr-2 h-4 w-4" />
                    New Case
                  </Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Cohort</TableHead>
                    <TableHead className="text-center">Questions</TableHead>
                    <TableHead className="text-center">Version</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c: ClinicalCase) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        <Link href={`/pde/faculty/cases/${c.id}/edit`} className="hover:underline">
                          {c.title}
                        </Link>
                        {c.description ? (
                          <p className="text-xs text-muted-foreground line-clamp-1">{c.description}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.course_code ? (
                          <>
                            <span className="font-medium text-foreground">{c.course_code}</span>
                            <br />
                            <span className="text-xs">{c.course_name}</span>
                          </>
                        ) : (
                          c.course_name || c.course_id.slice(0, 8)
                        )}
                      </TableCell>
                      <TableCell className="text-center">{c.question_count ?? '–'}</TableCell>
                      <TableCell className="text-center">v{c.version}</TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={c.status} />
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/pde/faculty/cases/${c.id}/edit`}>Edit</Link>
                        </Button>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/pde/faculty/cases/${c.id}/preview`}>Preview</Link>
                        </Button>
                        {c.status === 'published' ? (
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/pde/faculty/cases/${c.id}/attempts`}>Cohort</Link>
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
