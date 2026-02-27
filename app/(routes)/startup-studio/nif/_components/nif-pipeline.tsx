'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Search,
  AlertCircle,
  ArrowRight,
  Award,
  Eye,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Rocket,
  GraduationCap,
} from 'lucide-react';
import { useNifCandidates, useNifStageCounts } from '@/hooks/startup-studio';

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  identified: { label: 'Identified', color: 'bg-gray-100 text-gray-800', icon: Eye },
  screened: { label: 'Screened', color: 'bg-blue-100 text-blue-800', icon: Filter },
  shortlisted: { label: 'Shortlisted', color: 'bg-amber-100 text-amber-800', icon: CheckCircle },
  incubating: { label: 'Incubating', color: 'bg-purple-100 text-purple-800', icon: Rocket },
  graduated: { label: 'Graduated', color: 'bg-green-100 text-green-800', icon: GraduationCap },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
};

const STAGES = ['all', 'identified', 'screened', 'shortlisted', 'incubating', 'graduated', 'rejected'];

export function NifPipeline() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  const filters: Record<string, any> = {};
  if (stageFilter !== 'all') filters.stage = stageFilter;

  const { data: candidatesRaw, isLoading: candidatesLoading, error } = useNifCandidates(filters);
  const { data: stageCountsRaw, isLoading: countsLoading } = useNifStageCounts();

  const candidates = candidatesRaw as any;
  const stageCounts = stageCountsRaw as any;

  const candidatesList = Array.isArray(candidates) ? candidates : candidates?.data ?? [];

  const filteredCandidates = candidatesList.filter((c: any) => {
    const problemTitle = c.problem?.title ?? c.problem_title ?? '';
    const startupName = c.startup_name ?? '';
    const term = search.toLowerCase();
    return (
      problemTitle.toLowerCase().includes(term) ||
      startupName.toLowerCase().includes(term)
    );
  });

  // Parse stage counts - handle both array and object formats
  const stageCountsMap: Record<string, number> = {};
  if (Array.isArray(stageCounts)) {
    stageCounts.forEach((item: any) => {
      stageCountsMap[item.stage] = item.count ?? 0;
    });
  } else if (stageCounts && typeof stageCounts === 'object') {
    Object.assign(stageCountsMap, stageCounts);
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load NIF pipeline. Please try refreshing the page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stage Count Summary Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {['identified', 'screened', 'shortlisted', 'incubating', 'graduated'].map((stage) => {
          const config = STAGE_CONFIG[stage];
          const Icon = config.icon;
          return (
            <Card key={stage}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium capitalize">
                  {config.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {countsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">
                    {stageCountsMap[stage] ?? 0}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search candidates by problem or startup name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {STAGES.map((stage) => (
          <Button
            key={stage}
            variant={stageFilter === stage ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStageFilter(stage)}
            className="capitalize text-xs h-7"
          >
            {stage === 'all' ? 'All Stages' : STAGE_CONFIG[stage]?.label ?? stage}
          </Button>
        ))}
      </div>

      {/* Candidates List */}
      {candidatesLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-6 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCandidates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Award className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No candidates found</p>
            <p className="text-sm text-muted-foreground">
              {search
                ? 'Try adjusting your search or filters'
                : 'NIF candidates will appear here'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCandidates.map((candidate: any) => {
            const stage = candidate.current_stage ?? candidate.stage ?? 'identified';
            const config = STAGE_CONFIG[stage] ?? STAGE_CONFIG.identified;

            return (
              <Link
                key={candidate.id}
                href={`/startup-studio/nif/${candidate.id}`}
              >
                <Card className="cursor-pointer hover:bg-muted/50 transition-colors h-full">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium line-clamp-2">
                        {candidate.problem?.title ?? candidate.problem_title ?? 'Untitled Problem'}
                      </p>
                      <Badge
                        variant="outline"
                        className={config.color}
                      >
                        {config.label}
                      </Badge>
                    </div>
                    {candidate.startup_name && (
                      <p className="text-sm text-muted-foreground">
                        <Rocket className="inline h-3.5 w-3.5 mr-1" />
                        {candidate.startup_name}
                      </p>
                    )}
                    <div className="flex justify-end pt-2">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
