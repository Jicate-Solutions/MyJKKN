'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { OKRErrorBoundary } from '../_components';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
  User,
  ExternalLink,
  Target,
  AlertCircle,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useCascadeTree } from '@/hooks/okr/use-objectives';
import { OKRCascadeNode, OKRTier, OKRLevel } from '@/types/okr';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ============================================================================
// DESIGN RATIONALE
// ============================================================================
// Hierarchical tree visualization showing OKR alignment across tiers
// Color-coded by tier with visual depth indicators
// Collapsible nodes for information density management
// Progress bars show roll-up calculations
// Status badges provide at-a-glance health indicators

// ============================================================================
// CONFIGURATION
// ============================================================================

// Tier visual configuration
const tierConfig: Record<OKRTier, {
  label: string;
  color: string;
  bgClass: string;
  borderClass: string;
  description: string;
}> = {
  tier_1: {
    label: 'TIER 1',
    color: '#0b6d41', // JKKN Green
    bgClass: 'bg-emerald-900/20 dark:bg-emerald-900/30',
    borderClass: 'border-emerald-700 dark:border-emerald-600',
    description: 'Organization/Institution-level annual goals - Full (11 sections)'
  },
  tier_2: {
    label: 'TIER 2',
    color: '#0284c7', // Sky blue
    bgClass: 'bg-sky-900/20 dark:bg-sky-900/30',
    borderClass: 'border-sky-700 dark:border-sky-600',
    description: 'Department-level quarterly goals - Core (6 sections)'
  },
  tier_3: {
    label: 'TIER 3',
    color: '#7c3aed', // Violet
    bgClass: 'bg-violet-900/20 dark:bg-violet-900/30',
    borderClass: 'border-violet-700 dark:border-violet-600',
    description: 'Individual-level goals - Simple (3 sections)'
  }
};

// Level icons
const levelConfig: Record<OKRLevel, { icon: typeof Building2; label: string }> = {
  organization: { icon: Building2, label: 'JKKN Group' },
  institution: { icon: Building2, label: 'Institution' },
  department: { icon: Users, label: 'Department' },
  individual: { icon: User, label: 'Individual' }
};

// Status badge based on progress
const getStatusBadge = (progress: number) => {
  if (progress >= 75) {
    return { icon: CheckCircle2, label: 'On Track', className: 'text-green-400 bg-green-900/30' };
  }
  if (progress >= 50) {
    return { icon: AlertTriangle, label: 'At Risk', className: 'text-yellow-400 bg-yellow-900/30' };
  }
  return { icon: AlertCircle, label: 'Behind', className: 'text-red-400 bg-red-900/30' };
};

// ============================================================================
// COMPONENTS
// ============================================================================

interface CascadeNodeProps {
  node: OKRCascadeNode;
  depth?: number;
}

function CascadeNode({ node, depth = 0 }: CascadeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels

  const hasChildren = node.children && node.children.length > 0;
  const status = getStatusBadge(node.overall_progress);
  const StatusIcon = status.icon;
  const LevelIcon = levelConfig[node.level].icon;
  const tierStyle = tierConfig[node.tier];

  // Calculate indentation
  const indentWidth = depth * 24;

  return (
    <div className="relative">
      {/* Connector line for child nodes */}
      {depth > 0 && (
        <div
          className="absolute left-0 top-0 bottom-0 w-px bg-border"
          style={{ left: `${indentWidth - 12}px` }}
        />
      )}

      {/* Node Card */}
      <Card
        className={cn(
          'mb-2 transition-all hover:shadow-md',
          tierStyle.bgClass,
          tierStyle.borderClass
        )}
        style={{ marginLeft: `${indentWidth}px` }}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {/* Expand/Collapse Button */}
            <div className="flex-shrink-0 mt-1">
              {hasChildren ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <div className="h-6 w-6 flex items-center justify-center">
                  <Target className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Node Content */}
            <div className="flex-1 min-w-0">
              {/* Header Row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {tierStyle.label}
                    </Badge>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <LevelIcon className="h-3 w-3" />
                      <span className="text-xs">{levelConfig[node.level].label}</span>
                    </div>
                  </div>
                  <h3 className="font-semibold text-sm leading-tight">
                    {node.title}
                  </h3>
                  {node.owner && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Owner: {node.owner.full_name || node.owner.email}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <Link href={`/okr/objectives/${node.id}`}>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {/* Progress Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <Progress
                      value={node.overall_progress}
                      className="h-2"
                      style={{
                        '--progress-background': tierStyle.color
                      } as any}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {node.overall_progress}%
                    </span>
                    <Badge variant="outline" className={cn('text-xs', status.className)}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {status.label}
                    </Badge>
                  </div>
                </div>

                {/* Child count indicator */}
                {hasChildren && (
                  <div className="text-xs text-muted-foreground">
                    {node.children!.length} aligned {node.children!.length === 1 ? 'objective' : 'objectives'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Render Children */}
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {node.children!.map((child) => (
            <CascadeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function CascadeTreeSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-6 w-6" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function OKRCascadePage() {
  const [rootFilter, setRootFilter] = useState<string | undefined>(undefined);

  // Fetch cascade tree
  const { data: cascadeTree, isLoading, error } = useCascadeTree(rootFilter);

  // Show error toast only once when error occurs
  useEffect(() => {
    if (error) {
      toast.error('Failed to load OKR cascade');
    }
  }, [error]);

  // Calculate summary stats
  const totalObjectives = cascadeTree?.reduce((acc, node) => {
    const countNodes = (n: OKRCascadeNode): number => {
      return 1 + (n.children?.reduce((sum, child) => sum + countNodes(child), 0) || 0);
    };
    return acc + countNodes(node);
  }, 0) || 0;

  const avgProgress = cascadeTree?.reduce((acc, node) => {
    const sumProgress = (n: OKRCascadeNode): { sum: number; count: number } => {
      const childStats = n.children?.reduce(
        (stats, child) => {
          const childResult = sumProgress(child);
          return {
            sum: stats.sum + childResult.sum,
            count: stats.count + childResult.count
          };
        },
        { sum: 0, count: 0 }
      ) || { sum: 0, count: 0 };

      return {
        sum: childStats.sum + n.overall_progress,
        count: childStats.count + 1
      };
    };
    const result = sumProgress(node);
    return { sum: acc.sum + result.sum, count: acc.count + result.count };
  }, { sum: 0, count: 0 });

  const overallProgress = avgProgress && avgProgress.count > 0
    ? Math.round(avgProgress.sum / avgProgress.count)
    : 0;

  return (
    <ContentLayout title="OKR Cascade & Alignment">
      <OKRErrorBoundary>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">OKR Cascade & Alignment</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visualize how objectives connect across tiers and levels
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4">
            <Card className="bg-muted/50">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Total OKRs</div>
                <div className="text-2xl font-bold">{totalObjectives}</div>
              </CardContent>
            </Card>
            <Card className="bg-muted/50">
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">Avg Progress</div>
                <div className="text-2xl font-bold">{overallProgress}%</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Info Card */}
        <Card className="bg-sky-900/10 border-sky-700">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <AlertCircle className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm space-y-1">
                <p className="font-medium">How to read this view:</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  <li><span className="text-emerald-400">TIER 1</span> (Green): Organization/Institution-level annual goals - Full (11 sections)</li>
                  <li><span className="text-sky-400">TIER 2</span> (Blue): Department-level quarterly goals - Core (6 sections)</li>
                  <li><span className="text-violet-400">TIER 3</span> (Violet): Individual-level goals - Simple (3 sections)</li>
                  <li>Progress rolls up: TIER 2 = avg of TIER 3, TIER 1 = avg of TIER 2</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="w-64">
                <Select value={rootFilter || 'all'} onValueChange={(v) => setRootFilter(v === 'all' ? undefined : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Cascades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cascades</SelectItem>
                    {/* TODO: Add institution/department filters */}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" onClick={() => setRootFilter(undefined)}>
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Cascade Tree */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cascade Tree</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <CascadeTreeSkeleton />
            ) : !cascadeTree || cascadeTree.length === 0 ? (
              <div className="text-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="text-lg font-semibold mb-1">No OKRs Found</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Create your first objective to see the cascade
                </p>
                <Button asChild style={{ backgroundColor: '#0b6d41' }} className="hover:opacity-90">
                  <Link href="/okr/objectives/create">
                    Create Objective
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {cascadeTree.map((rootNode) => (
                  <CascadeNode key={rootNode.id} node={rootNode} depth={0} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm">Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <div className="font-medium mb-2">Tiers</div>
                <div className="space-y-2">
                  {Object.entries(tierConfig).map(([tier, config]) => (
                    <div key={tier} className="flex items-start gap-2">
                      <div className={cn('h-3 w-3 rounded mt-0.5 flex-shrink-0', config.bgClass, config.borderClass, 'border')} />
                      <div>
                        <span className="font-medium">{config.label}</span>
                        <p className="text-muted-foreground">{config.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-medium mb-2">Status</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-400" />
                    <span>On Track (≥75%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-yellow-400" />
                    <span>At Risk (50-74%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-3 w-3 text-red-400" />
                    <span>Behind (&lt;50%)</span>
                  </div>
                </div>
              </div>
              <div>
                <div className="font-medium mb-2">Levels</div>
                <div className="space-y-1">
                  {Object.entries(levelConfig).map(([level, config]) => {
                    const Icon = config.icon;
                    return (
                      <div key={level} className="flex items-center gap-2">
                        <Icon className="h-3 w-3" />
                        <span>{config.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
