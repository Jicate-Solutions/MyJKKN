'use client';

/**
 * Projects — Portfolio Dashboard (F4)
 *
 * Cross-institution command center. Three lenses over the same dataset,
 * switchable via a toggle:
 *   - Grid    : full-metric project cards
 *   - Board   : Kanban columns by overall status bucket
 *   - Heatmap : institution × status matrix + per-institution summaries
 *
 * Plus an institution filter, personal saved views (localStorage), and live
 * refresh via Supabase Realtime on the `projects` table (polling fallback).
 *
 * Pattern: app/(routes)/projects/page.tsx (ContentLayout + Breadcrumb),
 *   app/(routes)/hr/intelligence/page.tsx (URL-synced toggle).
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F4.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { TAP_TARGET, TAP_TARGET_BREADCRUMB } from '@/app/(routes)/projects/_lib/tap-targets';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  LayoutGrid,
  Columns3,
  Grid3x3,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { usePortfolio } from '@/hooks/projects/use-portfolio';
import { PortfolioGrid } from '@/components/projects/portfolio/portfolio-grid';
import { StatusBoard } from '@/components/projects/portfolio/status-board';
import { InstitutionHeatmap } from '@/components/projects/portfolio/institution-heatmap';
import {
  SavedViewsControl,
  type PortfolioViewConfig,
  type SavedView,
} from '@/components/projects/portfolio/saved-views-control';

type ViewMode = 'grid' | 'board' | 'heatmap';

const ALL_INSTITUTIONS = '__all__';

export default function PortfolioPage() {
  const { data, isLoading, isError, error, isFetching, realtimeDegraded } =
    usePortfolio();

  const [mode, setMode] = useState<ViewMode>('grid');
  const [institutionId, setInstitutionId] = useState<string>(ALL_INSTITUTIONS);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const projects = data?.projects ?? [];
  const institutions = data?.institutions ?? [];
  const heatmap = data?.heatmap ?? [];

  // Institution filter applied to the grid + board (heatmap always shows all).
  const filteredProjects = useMemo(() => {
    if (institutionId === ALL_INSTITUTIONS) return projects;
    if (institutionId === '__unassigned__') {
      return projects.filter((p) => !p.institution_id);
    }
    return projects.filter((p) => p.institution_id === institutionId);
  }, [projects, institutionId]);

  const currentViewConfig: PortfolioViewConfig = {
    mode,
    filters: { institutionId },
  };

  function applySavedView(view: SavedView) {
    if (view.mode === 'grid' || view.mode === 'board' || view.mode === 'heatmap') {
      setMode(view.mode);
    }
    const f = view.filters as { institutionId?: string };
    setInstitutionId(f.institutionId ?? ALL_INSTITUTIONS);
    setActiveViewId(view.id);
  }

  return (
    <ContentLayout title="Portfolio">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumb className={TAP_TARGET_BREADCRUMB}>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Portfolio</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-2">
          {isFetching && !isLoading && (
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <SavedViewsControl
            current={currentViewConfig}
            onApply={applySavedView}
            activeViewId={activeViewId}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={mode}
          onValueChange={(v) => {
            if (v) {
              setMode(v as ViewMode);
              setActiveViewId(null);
            }
          }}
          variant="outline"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" className={`gap-1.5 ${TAP_TARGET}`}>
            <LayoutGrid className="h-4 w-4" />
            Grid
          </ToggleGroupItem>
          <ToggleGroupItem value="board" aria-label="Status board view" className={`gap-1.5 ${TAP_TARGET}`}>
            <Columns3 className="h-4 w-4" />
            Board
          </ToggleGroupItem>
          <ToggleGroupItem value="heatmap" aria-label="Heatmap view" className={`gap-1.5 ${TAP_TARGET}`}>
            <Grid3x3 className="h-4 w-4" />
            Heatmap
          </ToggleGroupItem>
        </ToggleGroup>

        {mode !== 'heatmap' && (
          <Select
            value={institutionId}
            onValueChange={(v) => {
              setInstitutionId(v);
              setActiveViewId(null);
            }}
          >
            <SelectTrigger className={`w-[220px] ${TAP_TARGET}`}>
              <SelectValue placeholder="All institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_INSTITUTIONS}>All institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.institutionId} value={inst.institutionId}>
                  {inst.institutionName} ({inst.projectCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Realtime-degraded banner */}
      {realtimeDegraded && (
        <Alert className="mt-4">
          <WifiOff className="h-4 w-4" />
          <AlertDescription>
            Live updates unavailable — refreshing every 30s instead. (Realtime not
            enabled for the projects table.)
          </AlertDescription>
        </Alert>
      )}

      {/* Body */}
      <div className="mt-6">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading portfolio…
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load portfolio: {(error as Error)?.message ?? 'unknown error'}
            </AlertDescription>
          </Alert>
        ) : mode === 'grid' ? (
          <PortfolioGrid projects={filteredProjects} />
        ) : mode === 'board' ? (
          <StatusBoard projects={filteredProjects} />
        ) : (
          <InstitutionHeatmap institutions={institutions} heatmap={heatmap} />
        )}
      </div>
    </ContentLayout>
  );
}
