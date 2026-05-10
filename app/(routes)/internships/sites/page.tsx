'use client';

/**
 * Internship Sites — list view.
 *
 * Surfaces all internship_external_sites the current user can reach. Filter by
 * college (institution_id, restricted to user's accessible institutions), site
 * type, and active/inactive. Free-text search runs client-side over the loaded
 * page (the substrate doesn't yet expose a server-side ilike query).
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
import { Building2, Plus, AlertCircle, Search, MapPin } from 'lucide-react';
import { useSites } from '@/hooks/internships/useSites';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import type { SiteType } from '@/lib/services/internships/types';
import { SITE_TYPE_LABELS, SITE_TYPE_OPTIONS } from '../_components/sites/site-type-options';

type SiteTypeFilter = SiteType | 'all';
type ActiveFilter = 'all' | 'active' | 'inactive';

export default function InternshipSitesPage() {
  const { institutions, loading: institutionsLoading } = useUserInstitutionAccess();
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [siteTypeFilter, setSiteTypeFilter] = useState<SiteTypeFilter>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [search, setSearch] = useState('');

  const institutionId = institutionFilter === 'all' ? undefined : institutionFilter;
  const activeOnly = activeFilter === 'active';
  const { data: sites = [], isLoading, error } = useSites(institutionId, activeOnly);

  // The hook's `activeOnly` only filters when true. For 'inactive' we keep it
  // false (return all) and filter client-side; for 'all' we also keep false.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sites.filter((s) => {
      if (siteTypeFilter !== 'all' && s.site_type !== siteTypeFilter) return false;
      if (activeFilter === 'inactive' && s.is_active) return false;
      if (term) {
        const blob = `${s.name} ${s.address ?? ''} ${s.city ?? ''}`.toLowerCase();
        if (!blob.includes(term)) return false;
      }
      return true;
    });
  }, [sites, search, siteTypeFilter, activeFilter]);

  const institutionLookup = useMemo(() => {
    const m = new Map<string, string>();
    institutions.forEach((i) => m.set(i.institution_id, i.institution_name));
    return m;
  }, [institutions]);

  return (
    <ContentLayout title="Internships — Sites">
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
          <BreadcrumbItem><BreadcrumbPage>Sites</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              Sites
            </h1>
            <p className="text-sm text-muted-foreground">
              Hospital and external partner sites where learners are placed.
              {!isLoading && ` ${filtered.length} of ${sites.length} shown.`}
            </p>
          </div>
          <Button asChild>
            <Link href="/internships/sites/new">
              <Plus className="mr-2 h-4 w-4" />
              Add site
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-1 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name or address"
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select
                value={institutionFilter}
                onValueChange={(v) => setInstitutionFilter(v)}
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
              <Select
                value={siteTypeFilter}
                onValueChange={(v) => setSiteTypeFilter(v as SiteTypeFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Site type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All site types</SelectItem>
                  {SITE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
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
            <CardTitle className="text-base">Sites</CardTitle>
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
                <Building2 className="h-10 w-10 mx-auto opacity-40" />
                <p className="font-medium">
                  {sites.length === 0 ? 'No sites yet.' : 'No sites match your filters.'}
                </p>
                {sites.length === 0 && (
                  <>
                    <p className="text-xs max-w-md mx-auto">
                      Add your first hospital, clinic, or external partner site to start
                      placing learners.
                    </p>
                    <Button asChild size="sm" className="mt-2">
                      <Link href="/internships/sites/new">
                        <Plus className="mr-2 h-3 w-3" />
                        Add your first site
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
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">College</th>
                      <th className="py-2 pr-3">Location</th>
                      <th className="py-2 pr-3">Capacity</th>
                      <th className="py-2 pr-3">MoU</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((site) => (
                      <tr key={site.id} className="border-b hover:bg-muted/40">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/internships/sites/${site.id}`}
                            className="font-medium hover:underline"
                          >
                            {site.name}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          <Badge variant="secondary">
                            {SITE_TYPE_LABELS[site.site_type] ?? site.site_type}
                          </Badge>
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground">
                          {institutionLookup.get(site.institution_id) ?? '—'}
                        </td>
                        <td className="py-2 pr-3 max-w-[260px]">
                          {site.address || site.city ? (
                            <div className="flex items-start gap-1 text-xs">
                              <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                              <span className="truncate" title={[site.address, site.city, site.state].filter(Boolean).join(', ')}>
                                {[site.address, site.city].filter(Boolean).join(', ') || '—'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">{site.capacity ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {site.mou_signed ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                              Signed
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600">
                              Pending
                            </Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {site.is_active ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-600">Inactive</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right">
                          <Button asChild variant="ghost" size="sm">
                            <Link href={`/internships/sites/${site.id}`}>View</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
