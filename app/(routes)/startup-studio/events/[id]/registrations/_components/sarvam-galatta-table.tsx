'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Building2, CheckCircle2, ExternalLink, Github, Key, Loader2,
  MapPin, RotateCw, Search, Sparkles, Users,
} from 'lucide-react';
import { useAllRegistrations, useSarvamGalattaStats } from '@/hooks/startup-studio/use-sarvam-galatta';
import type { SarvamGalattaRegistration } from '@/types/sarvam-galatta';

// ---------------------------------------------------------------
// KPI stat card
// ---------------------------------------------------------------

function StatCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------
// API key checkbox display (admin sees tick, never the key value)
// ---------------------------------------------------------------

function KeyBadge({ provided }: { provided: boolean }) {
  return provided ? (
    <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 dark:text-green-400 text-xs">
      <CheckCircle2 className="h-3 w-3" /> Yes
    </Badge>
  ) : (
    <Badge variant="outline" className="text-muted-foreground text-xs">—</Badge>
  );
}

// ---------------------------------------------------------------
// Row detail
// ---------------------------------------------------------------

function LinkCell({ url }: { url: string | null }) {
  if (!url) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      View <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------

interface SarvamGalattaTableProps {
  eventId: string;
}

export function SarvamGalattaTable({ eventId }: SarvamGalattaTableProps) {
  const [search, setSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const LIMIT = 25;

  const { data: stats, isPending: statsPending } = useSarvamGalattaStats();
  const { data: result, isPending: tablePending, refetch } = useAllRegistrations({
    search: search || undefined,
    institution_id: institutionFilter || undefined,
    page,
    limit: LIMIT,
  });

  const rows: SarvamGalattaRegistration[] = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">

      {/* Stats */}
      {!statsPending && stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Total Registrations"
            value={stats.total}
          />
          <StatCard
            icon={<Sparkles className="h-4 w-4" />}
            label="Gemini API Keys"
            value={stats.total}
            sub="All required"
          />
          <StatCard
            icon={<MapPin className="h-4 w-4" />}
            label="Maps API Keys"
            value={stats.with_maps_key}
            sub={`${stats.total > 0 ? Math.round((stats.with_maps_key / stats.total) * 100) : 0}% provided`}
          />
          <StatCard
            icon={<Building2 className="h-4 w-4" />}
            label="Institutions"
            value={stats.by_institution.length}
            sub="Unique institutions"
          />
        </div>
      )}

      {/* Institution breakdown */}
      {!statsPending && stats && stats.by_institution.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Registrations by Institution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stats.by_institution.map((inst) => (
                <Badge
                  key={inst.institution_id}
                  variant="secondary"
                  className="gap-1 cursor-pointer"
                  onClick={() =>
                    setInstitutionFilter(
                      institutionFilter === inst.institution_id ? '' : inst.institution_id
                    )
                  }
                >
                  {inst.institution_name}
                  <span className="ml-1 rounded-full bg-background/60 px-1.5 py-0.5 text-xs font-semibold">
                    {inst.count}
                  </span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or URL…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => refetch()}
        >
          <RotateCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        {(search || institutionFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setInstitutionFilter(''); setPage(1); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>Program · Semester</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>GitHub</TableHead>
              <TableHead className="text-center">
                <span className="flex items-center justify-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Gemini
                </span>
              </TableHead>
              <TableHead className="text-center">
                <span className="flex items-center justify-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-red-500" /> Maps
                </span>
              </TableHead>
              <TableHead>Team Code</TableHead>
              <TableHead>Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tablePending ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground text-sm">
                  {search || institutionFilter ? 'No results match your filters.' : 'No registrations yet.'}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium text-sm">
                      {`${row.snap_first_name} ${row.snap_last_name ?? ''}`.trim()}
                    </div>
                    {row.owner_email && (
                      <div className="text-xs text-muted-foreground">{row.owner_email}</div>
                    )}
                    {row.team_name && (
                      <div className="text-xs text-muted-foreground italic">{row.team_name}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.institution_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{row.program_name ?? '—'}</div>
                    {row.semester_name && (
                      <div className="text-xs text-muted-foreground">{row.semester_name}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <LinkCell url={row.project_url} />
                  </TableCell>
                  <TableCell>
                    <LinkCell url={row.github_url} />
                  </TableCell>
                  <TableCell className="text-center">
                    <KeyBadge provided={!!row.gemini_api_key} />
                  </TableCell>
                  <TableCell className="text-center">
                    <KeyBadge provided={!!row.google_maps_api_key} />
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.team_code ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(row.submitted_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
