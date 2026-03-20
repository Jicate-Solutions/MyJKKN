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
import { Trophy, ArrowRight, Lightbulb, IndianRupee, BookOpen, Building2, AlertCircle, ArrowUpDown, CalendarDays } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';
import { useParadigmShiftOverview } from '@/hooks/solutions/use-paradigm-shift';
import { DepartmentCard } from './department-card';
import { TierBadge, getTierColor } from './tier-badge';
import { formatCurrency } from '@/lib/services/solutions';
import type { ReadinessTier } from '@/lib/services/solutions/paradigm-shift-service';

export function OverviewGrid() {
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');

  const filters: {
    institution_id?: string;
    tier?: ReadinessTier;
  } = {};
  if (institutionFilter !== 'all') filters.institution_id = institutionFilter;
  if (tierFilter !== 'all') filters.tier = tierFilter as ReadinessTier;

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

  // Sort by composite score (highest first)
  const sortedDepts = data?.departments
    ? [...data.departments].sort((a, b) => b.composite_score - a.composite_score)
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
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
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

      {/* Tier Distribution */}
      {data?.summary && (
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-sm text-muted-foreground">Tier Distribution:</span>
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
            <SelectValue placeholder="All Tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="pioneer">Pioneer</SelectItem>
            <SelectItem value="solution_ready">Solution-Ready</SelectItem>
            <SelectItem value="emerging">Emerging</SelectItem>
            <SelectItem value="traditional">Traditional</SelectItem>
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
