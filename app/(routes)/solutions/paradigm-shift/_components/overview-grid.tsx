'use client';

import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Trophy, ArrowRight, Lightbulb, IndianRupee, BookOpen, Building2, AlertCircle, ArrowUpDown, CalendarDays, Heart, Cpu, Palette, Users, HandHeart, Globe, type LucideIcon } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { useParadigmShiftOverview } from '@/hooks/solutions/use-paradigm-shift';
import { DepartmentCard } from './department-card';
import { TierBadge, getTierColor } from './tier-badge';
import { formatCurrency } from '@/lib/services/solutions';
import {
  SOCIETAL_AVAILABILITY_REASONS,
  type ReadinessTier,
  type SocietalAvailability,
} from '@/lib/services/solutions/paradigm-shift-service';
import { CLUSTER_LABELS, type SolutionsCluster } from '@/lib/services/solutions/clusters';

function getCurrentFYLabel(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `FY ${year}-${String(year + 1).slice(-2)}`;
}

/** The short words on the card itself when there is no number to show. */
const SOCIETAL_ABSENCE_LABELS: Record<Exclude<SocietalAvailability, 'measured'>, string> = {
  source_unavailable: 'Not tracked yet',
  not_visible: 'Hidden from your role',
  unconfirmed: 'Could not be checked',
};

/**
 * A societal figure, or an honest account of why there isn't one.
 *
 * DESIGN SYSTEM (design-system/MASTER.md §6 and the review checklist). This card
 * used to carry `border-emerald-200 bg-emerald-50/50`, `text-emerald-600/700` and
 * `text-emerald-900` with no dark pairing at all — a near-white surface and
 * near-black text in dark mode, and on white `emerald-600` measures 3.30:1 against
 * the 4.5:1 minimum. The surface is now the semantic `Card` default (which is
 * theme-aware) and the one accent left is the sanctioned theme-paired status pair
 * `text-green-700 dark:text-emerald-400`.
 */
function SocietalCard({
  icon: Icon,
  label,
  value,
  availability,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null | undefined;
  availability: SocietalAvailability;
}) {
  // `availability` is the authority, not the value: a `0` that arrived while the
  // register was invisible is not a measurement, and must never print as one.
  const measured = availability === 'measured' && typeof value === 'number';
  return (
    <Card className={measured ? undefined : 'border-dashed'}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon
            className={`h-4 w-4 ${measured ? 'text-green-700 dark:text-emerald-400' : 'text-muted-foreground'}`}
          />
          <span className={`text-xs ${measured ? 'text-foreground' : 'text-muted-foreground'}`}>
            {label}
          </span>
        </div>
        {measured ? (
          <p className="text-2xl font-bold text-foreground">{value.toLocaleString('en-IN')}</p>
        ) : (
          <p className="text-sm font-medium text-muted-foreground">
            {SOCIETAL_ABSENCE_LABELS[availability as Exclude<SocietalAvailability, 'measured'>] ??
              'Not tracked yet'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewGrid() {
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [clusterFilter, setClusterFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'score' | 'revenue' | 'solutions' | 'publications'>('score');

  const filters: {
    institution_id?: string;
    tier?: ReadinessTier;
    cluster?: SolutionsCluster;
  } = {};
  if (institutionFilter !== 'all') filters.institution_id = institutionFilter;
  if (tierFilter !== 'all') filters.tier = tierFilter as ReadinessTier;
  if (clusterFilter !== 'all') filters.cluster = clusterFilter as SolutionsCluster;

  const { data, isLoading, error } = useParadigmShiftOverview(
    Object.keys(filters).length > 0 ? filters : undefined
  );

  // Keep stable institution list from first load to avoid self-referential filter
  const institutionsRef = useRef<[string, string][]>([]);
  if (data?.departments && institutionsRef.current.length === 0) {
    const instMap = new Map(data.departments.map(d => [d.institution_id, d.institution_name]));
    if (instMap.size > 0) {
      institutionsRef.current = [...instMap.entries()];
    }
  }
  const institutions = institutionsRef.current;

  // The service now says WHY a societal figure is missing, so the page stops
  // inferring it from the shape of the value. Before the first load lands there
  // is nothing to characterise, so treat it as unconfirmed rather than measured.
  const societalAvailability: SocietalAvailability =
    data?.summary.societal_availability ?? 'unconfirmed';

  // Sort departments by selected criterion (highest first)
  const sortedDepts = data?.departments
    ? [...data.departments].sort((a, b) => {
        switch (sortBy) {
          case 'revenue': return b.metrics.revenue_generated - a.metrics.revenue_generated;
          case 'solutions': return b.metrics.solutions_built - a.metrics.solutions_built;
          case 'publications': return b.metrics.publications - a.metrics.publications;
          default: return b.composite_score - a.composite_score;
        }
      })
    : [];

  const tiers: ReadinessTier[] = ['traditional', 'emerging', 'solution_ready', 'pioneer'];

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load paradigm shift data. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dual-Axis Summary Cards */}
      <div className="space-y-3">
        {/* Commercial Value */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Commercial Value</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-4 w-32" /></CardContent></Card>
              ))
            ) : (
              <>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Departments</span>
                    </div>
                    <p className="text-2xl font-bold">{data?.summary.total_departments || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Solutions</span>
                    </div>
                    <p className="text-2xl font-bold">{data?.summary.total_solutions || 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <IndianRupee className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Revenue</span>
                    </div>
                    <p className="text-2xl font-bold">{formatCurrency(data?.summary.total_revenue || 0)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Publications</span>
                    </div>
                    <p className="text-2xl font-bold">{data?.summary.total_publications || 0}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Societal Value */}
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Societal Value</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}><CardContent className="p-4"><Skeleton className="h-8 w-20 mb-2" /><Skeleton className="h-4 w-32" /></CardContent></Card>
              ))
            ) : (
              <>
                <SocietalCard
                  icon={Users}
                  label="Beneficiaries"
                  value={data?.summary.total_beneficiaries}
                  availability={societalAvailability}
                />
                {/*
                  Pro-bono carries its OWN verdict. It comes from sh_solutions,
                  behind a different policy from the engagement register, and is
                  null only when that one column could not be read — so the
                  register being invisible must not relabel a number this reader
                  can see as "hidden from your role".
                */}
                <SocietalCard
                  icon={HandHeart}
                  label="Pro-Bono Solutions"
                  value={data?.summary.total_pro_bono}
                  availability={
                    typeof data?.summary.total_pro_bono === 'number'
                      ? 'measured'
                      : 'source_unavailable'
                  }
                />
                <SocietalCard
                  icon={Globe}
                  label="Community Engagements"
                  value={data?.summary.total_community_engagements}
                  availability={societalAvailability}
                />
              </>
            )}
          </div>
          {!isLoading && data && societalAvailability !== 'measured' && (
            <p className="text-xs text-muted-foreground mt-2">
              {SOCIETAL_AVAILABILITY_REASONS[societalAvailability]}
            </p>
          )}
        </div>
      </div>
      {/* end of dual-axis summary */}

      {/* Cluster Summary Cards */}
      {data?.summary?.by_cluster && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { key: 'health' as SolutionsCluster, icon: Heart, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
            { key: 'tech' as SolutionsCluster, icon: Cpu, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
            { key: 'arts_professional' as SolutionsCluster, icon: Palette, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
          ]).map(({ key, icon: Icon, color, bg }) => {
            const cluster = data.summary.by_cluster[key];
            return (
              <Card key={key} className={`${bg} cursor-pointer hover:shadow-sm transition-shadow`}
                onClick={() => setClusterFilter(clusterFilter === key ? 'all' : key)}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${color} shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{CLUSTER_LABELS[key]}</p>
                    <p className="text-xs text-muted-foreground">
                      {cluster.count} depts &middot; {cluster.solutions} solutions &middot; {formatCurrency(cluster.revenue)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tier Distribution */}
      {data?.summary && (
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-muted-foreground">Journey Levels:</span>
          {tiers.map(tier => (
            <div key={tier} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getTierColor(tier) }}
              />
              <TierBadge tier={tier} />
              <span className="text-sm font-medium">{data.summary.by_tier[tier] ?? 0}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={institutionFilter} onValueChange={setInstitutionFilter}>
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="All Institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Institutions</SelectItem>
            {institutions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="pioneer">Transformed</SelectItem>
            <SelectItem value="solution_ready">Scaling</SelectItem>
            <SelectItem value="emerging">First Project</SelectItem>
            <SelectItem value="traditional">Exploring</SelectItem>
          </SelectContent>
        </Select>

        <Select value={clusterFilter} onValueChange={setClusterFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Clusters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clusters</SelectItem>
            <SelectItem value="health">Health Solutions</SelectItem>
            <SelectItem value="tech">Tech Solutions</SelectItem>
            <SelectItem value="arts_professional">Arts & Professional</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-[180px]">
            <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Sort by Score" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Sort by Score</SelectItem>
            <SelectItem value="revenue">Sort by Revenue</SelectItem>
            <SelectItem value="solutions">Sort by Solutions</SelectItem>
            <SelectItem value="publications">Sort by Publications</SelectItem>
          </SelectContent>
        </Select>

        <Select value="current_fy" disabled>
          <SelectTrigger className="w-[180px]">
            <CalendarDays className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue placeholder={getCurrentFYLabel()} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current_fy">{getCurrentFYLabel()}</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" asChild>
          <Link href="/solutions/paradigm-shift/leaderboard">
            <Trophy className="h-4 w-4 mr-2" />
            Leaderboard
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </div>

      {/* Department Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2 w-full" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                  <Skeleton className="h-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedDepts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No departments found matching your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedDepts.map(dept => (
            <DepartmentCard key={dept.department_id} dept={dept} />
          ))}
        </div>
      )}
    </div>
  );
}
