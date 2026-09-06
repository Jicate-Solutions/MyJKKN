'use client';

import { useState, useMemo } from 'react';
import { Search, Building2, SlidersHorizontal, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useJobs } from '@/hooks/hr/use-recruitment';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { HRRecruitmentJob, RoleCategory } from '@/types/hr-recruitment';
import { ROLE_CATEGORY_LABELS } from '@/types/hr-recruitment';
import { JobCard } from './job-card';

interface JobsBrowserProps {
  onSelectJob: (job: HRRecruitmentJob) => void;
}

export function JobsBrowser({ onSelectJob }: JobsBrowserProps) {
  const [search, setSearch] = useState('');
  const [institutionId, setInstitutionId] = useState('__all__');
  const [roleCategory, setRoleCategory] = useState('__all__');

  const { institutions } = useInstitutionsWithAccess();

  const { data, isLoading, error } = useJobs({
    status: 'open',
    institution_id: institutionId !== '__all__' ? institutionId : undefined,
    pageSize: 100,
  });

  const jobs = data?.data ?? [];

  // Client-side search filter (server already handles institution + status)
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (roleCategory !== '__all__' && job.role_category !== roleCategory) return false;
      if (!q) return true;
      return (
        job.title.toLowerCase().includes(q) ||
        (job.city ?? '').toLowerCase().includes(q) ||
        (job.state ?? '').toLowerCase().includes(q)
      );
    });
  }, [jobs, search, roleCategory]);

  // Build a name lookup for institutions
  const instNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    institutions.forEach((i) => { map[i.id] = i.name; });
    return map;
  }, [institutions]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-background p-6 shadow-sm">
        <h2 className="text-xl font-bold text-foreground">Find Your Next Role</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse open positions across JKKN institutions and apply in minutes.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
            <Search className="h-4 w-4" />
          </span>
          <Input
            placeholder="Search by title, city…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {institutions.length > 0 && (
          <Select value={institutionId} onValueChange={setInstitutionId}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground mr-2">
                <Building2 className="h-4 w-4" />
              </span>
              <SelectValue placeholder="All Institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={roleCategory} onValueChange={setRoleCategory}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center text-muted-foreground mr-2">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Categories</SelectItem>
            {(Object.entries(ROLE_CATEGORY_LABELS) as [RoleCategory, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          <span className="text-sm">Loading open positions…</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">Failed to load job postings. Please try again.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Search className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-foreground">No open positions found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search || institutionId !== '__all__' || roleCategory !== '__all__'
              ? 'Try adjusting your filters.'
              : 'No positions are currently open. Check back soon.'}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filtered.length}</span> open position{filtered.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-3">
            {filtered.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                institutionName={job.institution_id ? instNameMap[job.institution_id] : undefined}
                onSelect={onSelectJob}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
