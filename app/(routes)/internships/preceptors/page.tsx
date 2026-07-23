'use client';

/**
 * Internship Preceptors — list view.
 *
 * Surfaces preceptors across the colleges the current user can reach. Filters
 * apply over the loaded set. We resolve `site_id → site name → institution_id`
 * by joining client-side against useSites + useUserInstitutionAccess. Assigned
 * learner counts are computed from useAssignments — only assignments with
 * status='active' or 'pending' are counted (completed/withdrawn are dormant).
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BeatLoader } from 'react-spinners';
import { Stethoscope, Plus, AlertCircle, Search, Phone, Mail } from 'lucide-react';
import { usePreceptors } from '@/hooks/internships/usePreceptors';
import { useSites } from '@/hooks/internships/useSites';
import { useAssignments } from '@/hooks/internships/useAssignments';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import type { PreceptorScopeType } from '@/lib/services/internships/types';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { NoAccessAlert } from '../_components/no-access-alert';

type ActiveFilter = 'all' | 'active' | 'inactive';
type ScopeFilter = PreceptorScopeType | 'all';

export default function InternshipPreceptorsPage() {
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const [collegeFilter, setCollegeFilter] = useState<string>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [search, setSearch] = useState('');

  // Pull all preceptors for current scope; filter client-side.
  const { data: preceptors = [], isLoading, error } = usePreceptors(undefined, false);
  const { data: sites = [] } = useSites();
  const { data: assignments = [] } = useAssignments();

  const siteLookup = useMemo(() => {
    const m = new Map<string, { name: string; institution_id: string }>();
    sites.forEach((s) => m.set(s.id, { name: s.site_name, institution_id: s.institution_id }));
    return m;
  }, [sites]);

  const institutionLookup = useMemo(() => {
    const m = new Map<string, string>();
    institutions.forEach((i) => m.set(i.institution_id, i.institution_name));
    return m;
  }, [institutions]);

  // Live learner counts per preceptor (active or pending assignments).
  const learnerCountByPreceptor = useMemo(() => {
    const counts = new Map<string, number>();
    assignments.forEach((a) => {
      if (!a.preceptor_id) return;
      if (a.status !== 'active' && a.status !== 'pending') return;
      counts.set(a.preceptor_id, (counts.get(a.preceptor_id) ?? 0) + 1);
    });
    return counts;
  }, [assignments]);

  // Sites available in the dropdown — restricted by college filter.
  const filteredSites = useMemo(() => {
    if (collegeFilter === 'all') return sites;
    return sites.filter((s) => s.institution_id === collegeFilter);
  }, [sites, collegeFilter]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return preceptors.filter((p) => {
      if (collegeFilter !== 'all' && p.institution_id !== collegeFilter) return false;
      if (siteFilter !== 'all' && p.site_id !== siteFilter) return false;
      if (scopeFilter !== 'all' && p.scope_type !== scopeFilter) return false;
      if (activeFilter === 'active' && !p.is_active) return false;
      if (activeFilter === 'inactive' && p.is_active) return false;
      if (term) {
        const blob = `${p.full_name} ${p.mobile ?? ''} ${p.email ?? ''} ${p.specialization ?? ''} ${p.designation ?? ''}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      return true;
    });
  }, [preceptors, search, collegeFilter, siteFilter, scopeFilter, activeFilter]);

  return (
    <PermissionGuard module="internship.preceptors" action="view" fallback={<NoAccessAlert />}>
    <ContentLayout title="Internships — Preceptors">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/internships">Internships</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Preceptors</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Stethoscope className="h-6 w-6" />
              Preceptors
            </h1>
            <p className="text-sm text-muted-foreground">
              Clinical and field supervisors who sign off learner work.
              {!isLoading && ` ${filtered.length} of ${preceptors.length} shown.`}
            </p>
          </div>
          <Button asChild>
            <Link href="/internships/preceptors/new">
              <Plus className="mr-2 h-4 w-4" />
              Add preceptor
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="grid gap-3 md:grid-cols-5">
              <div className="md:col-span-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name, mobile, email"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={collegeFilter}
                onValueChange={(v) => {
                  setCollegeFilter(v);
                  setSiteFilter('all');
                }}
                disabled={institutionsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="College" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All my colleges</SelectItem>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.institution_id} value={inst.institution_id}>
                      {inst.institution_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={siteFilter} onValueChange={(v) => setSiteFilter(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Site" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sites</SelectItem>
                  {filteredSites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={scopeFilter}
                onValueChange={(v) => setScopeFilter(v as ScopeFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Scope" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scopes</SelectItem>
                  <SelectItem value="cycle">Cycle</SelectItem>
                  <SelectItem value="site">Site</SelectItem>
                  <SelectItem value="institution">Institution</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={activeFilter}
                onValueChange={(v) => setActiveFilter(v as ActiveFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preceptors</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex justify-center py-8">
                <BeatLoader color="#3b82f6" />
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 text-red-600 py-4">
                <AlertCircle className="h-4 w-4" />
                <span>Failed to load: {error instanceof Error ? error.message : 'Unknown error'}</span>
              </div>
            )}
            {!isLoading && !error && filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground space-y-3">
                <Stethoscope className="h-10 w-10 mx-auto opacity-40" />
                <p className="font-medium">
                  {preceptors.length === 0 ? 'No preceptors yet.' : 'No preceptors match your filters.'}
                </p>
                {preceptors.length === 0 && (
                  <>
                    <p className="text-xs max-w-md mx-auto">
                      Add preceptors so they can sign off logbook entries and submit
                      evaluations from their phones.
                    </p>
                    <Button asChild size="sm" className="mt-2">
                      <Link href="/internships/preceptors/new">
                        <Plus className="mr-2 h-3 w-3" />
                        Add your first preceptor
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            )}
            {!isLoading && !error && filtered.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b">
                    <tr className="text-left text-muted-foreground">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Designation</th>
                      <th className="py-2 pr-3">Site</th>
                      <th className="py-2 pr-3">College</th>
                      <th className="py-2 pr-3">Contact</th>
                      <th className="py-2 pr-3">Scope</th>
                      <th className="py-2 pr-3">Students</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => {
                      const site = siteLookup.get(p.site_id);
                      const learnerCount = learnerCountByPreceptor.get(p.id) ?? 0;
                      return (
                        <tr key={p.id} className="border-b hover:bg-muted/40">
                          <td className="py-2 pr-3">
                            <Link
                              href={`/internships/preceptors/${p.id}`}
                              className="font-medium hover:underline"
                            >
                              {p.full_name}
                            </Link>
                            {p.qualification && (
                              <div className="text-xs text-muted-foreground">{p.qualification}</div>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {p.designation || p.specialization || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {site ? (
                              <Link
                                href={`/internships/sites/${p.site_id}`}
                                className="hover:underline"
                              >
                                {site.name}
                              </Link>
                            ) : '—'}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted-foreground">
                            {institutionLookup.get(p.institution_id) ?? '—'}
                          </td>
                          <td className="py-2 pr-3 text-xs space-y-0.5">
                            {p.mobile && (
                              <div className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {p.mobile}
                              </div>
                            )}
                            {p.email && (
                              <div className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                <span className="truncate max-w-[180px]">{p.email}</span>
                              </div>
                            )}
                            {!p.mobile && !p.email && (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline" className="text-xs capitalize">
                              {p.scope_type}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant="outline">
                              {learnerCount} / {p.max_students}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3">
                            {p.is_active ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/internships/preceptors/${p.id}`}>View</Link>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
