'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useCapabilities, useLearnerCapabilities } from '@/hooks/pde/use-pde';
import { useAuth } from '@/hooks/use-auth';
import {
  Lock,
  Circle,
  Clock,
  CheckCircle2,
  Star,
  ChevronDown,
  ChevronRight,
  TreePine,
  BookOpen,
  Zap,
  Brain,
  Users,
  Crown,
  Wrench,
  Briefcase,
  GraduationCap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  PDECapability,
  PDELearnerCapability,
  CapabilityCategory,
  CapabilityStatus,
} from '@/types/pde';

// ============================================
// Constants
// ============================================

const CATEGORY_CONFIG: Record<CapabilityCategory, { label: string; icon: typeof Brain; color: string }> = {
  ai_fluency: { label: 'AI Fluency', icon: Brain, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30' },
  domain_ai: { label: 'Domain AI', icon: Zap, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' },
  cross_functional: { label: 'Cross-Functional', icon: Users, color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/30' },
  production: { label: 'Production', icon: Wrench, color: 'text-red-600 bg-red-50 dark:bg-red-950/30' },
  human_presence: { label: 'Human Presence', icon: Crown, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' },
  principal: { label: 'Leadership', icon: GraduationCap, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30' },
  technical: { label: 'Technical', icon: Wrench, color: 'text-slate-600 bg-slate-50 dark:bg-slate-950/30' },
  professional: { label: 'Professional', icon: Briefcase, color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/30' },
};

const STATUS_CONFIG: Record<CapabilityStatus, { label: string; icon: typeof Lock; color: string; bgColor: string }> = {
  locked: {
    label: 'Locked',
    icon: Lock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
  },
  available: {
    label: 'Available',
    icon: Circle,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
  },
  demonstrated: {
    label: 'Demonstrated',
    icon: CheckCircle2,
    color: 'text-[#0b6d41]',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/20',
  },
  mastered: {
    label: 'Mastered',
    icon: Star,
    color: 'text-[#ffde59]',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
  },
};

const LEVEL_LABELS: Record<number, string> = {
  1: 'Foundation',
  2: 'Developing',
  3: 'Proficient',
  4: 'Advanced',
  5: 'Expert',
};

// ============================================
// Tree Node Component
// ============================================

interface TreeNodeData {
  capability: PDECapability;
  learnerStatus: CapabilityStatus;
  children: TreeNodeData[];
}

function CapabilityTreeNode({
  node,
  depth,
  isLast,
  parentConnectors,
}: {
  node: TreeNodeData;
  depth: number;
  isLast: boolean;
  parentConnectors: boolean[];
}) {
  const [expanded, setExpanded] = useState(
    node.learnerStatus !== 'locked' || depth < 2
  );

  const statusConfig = STATUS_CONFIG[node.learnerStatus];
  const StatusIcon = statusConfig.icon;
  const hasChildren = node.children.length > 0;
  const isCurrentFocus =
    node.learnerStatus === 'in_progress' || node.learnerStatus === 'available';

  return (
    <li className="relative">
      {/* Tree connector lines */}
      <div className="flex">
        {/* Vertical + horizontal connectors */}
        {depth > 0 && (
          <div className="flex shrink-0">
            {parentConnectors.map((showLine, idx) => (
              <div key={idx} className="w-6 relative">
                {showLine && (
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                )}
              </div>
            ))}
            <div className="w-6 relative">
              {/* Horizontal line from parent */}
              <div className="absolute left-0 top-4 w-3 h-px bg-border" />
              {/* Vertical line continuing down (if not last) */}
              {!isLast && (
                <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
              )}
              {/* Vertical line to this node */}
              <div className="absolute left-0 top-0 h-4 w-px bg-border" />
            </div>
          </div>
        )}

        {/* Node content */}
        <div
          className={cn(
            'flex-1 group',
            isCurrentFocus && 'relative'
          )}
        >
          {/* Current focus indicator */}
          {node.learnerStatus === 'in_progress' && (
            <div className="absolute -left-1 top-1 bottom-1 w-0.5 bg-amber-400 rounded-full" />
          )}

          <div
            className={cn(
              'flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors',
              statusConfig.bgColor,
              'hover:ring-1 hover:ring-border/50',
              node.learnerStatus === 'locked' && 'opacity-60'
            )}
          >
            {/* Expand/collapse toggle */}
            {hasChildren ? (
              <button
                onClick={() => setExpanded(!expanded)}
                className="shrink-0 p-0.5 rounded hover:bg-muted"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            ) : (
              <div className="w-4.5 shrink-0" />
            )}

            {/* Status icon */}
            <StatusIcon className={cn('h-4 w-4 shrink-0', statusConfig.color)} />

            {/* Name + level */}
            <Link
              href={`/learn/capabilities/${node.capability.id}`}
              className={cn(
                'text-sm flex-1 min-w-0 truncate transition-colors',
                node.learnerStatus === 'locked'
                  ? 'text-muted-foreground'
                  : 'text-foreground hover:text-[#0b6d41]',
                isCurrentFocus && 'font-medium'
              )}
            >
              {node.capability.name}
            </Link>

            {/* Level badge */}
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] h-5 px-1.5 shrink-0',
                node.learnerStatus === 'locked' && 'opacity-50'
              )}
            >
              L{node.capability.level}
            </Badge>

            {/* Fink's dimension */}
            {node.capability.finks_dimension && (
              <Badge
                variant="secondary"
                className="text-[10px] h-5 px-1.5 shrink-0 hidden sm:inline-flex"
              >
                {node.capability.finks_dimension.split('_').map(w => w[0].toUpperCase()).join('')}
              </Badge>
            )}

            {/* "YOU ARE HERE" marker */}
            {node.learnerStatus === 'in_progress' && (
              <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 shrink-0 hidden sm:inline">
                YOU
              </span>
            )}

            {/* Core indicator */}
            {node.capability.is_core && (
              <div className="w-1.5 h-1.5 rounded-full bg-[#0b6d41] shrink-0" title="Core capability" />
            )}
          </div>

          {/* Children */}
          {hasChildren && expanded && (
            <ul className="mt-0.5">
              {node.children.map((child, idx) => (
                <CapabilityTreeNode
                  key={child.capability.id}
                  node={child}
                  depth={depth + 1}
                  isLast={idx === node.children.length - 1}
                  parentConnectors={[
                    ...parentConnectors,
                    ...(depth > 0 ? [!isLast] : []),
                  ]}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

// ============================================
// Tree Builder Utility
// ============================================

function buildTree(
  capabilities: PDECapability[],
  learnerCaps: Map<string, CapabilityStatus>
): TreeNodeData[] {
  // Build adjacency from prerequisite_ids
  const byId = new Map<string, PDECapability>();
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const cap of capabilities) {
    byId.set(cap.id, cap);
  }

  for (const cap of capabilities) {
    const prereqs = (cap.prerequisite_ids || []) as string[];
    for (const prereqId of prereqs) {
      if (byId.has(prereqId)) {
        if (!childrenOf.has(prereqId)) {
          childrenOf.set(prereqId, []);
        }
        childrenOf.get(prereqId)!.push(cap.id);
        hasParent.add(cap.id);
      }
    }
  }

  // Root nodes = capabilities with no prerequisites (or prerequisites not in this category)
  const rootIds = capabilities
    .filter((c) => !hasParent.has(c.id))
    .map((c) => c.id);

  function buildNode(capId: string): TreeNodeData {
    const cap = byId.get(capId)!;
    const children = (childrenOf.get(capId) || [])
      .map((childId) => buildNode(childId))
      .sort((a, b) => a.capability.level - b.capability.level);

    return {
      capability: cap,
      learnerStatus: learnerCaps.get(capId) || 'locked',
      children,
    };
  }

  return rootIds
    .map((id) => buildNode(id))
    .sort((a, b) => a.capability.level - b.capability.level);
}

// ============================================
// Progress Summary Component
// ============================================

function ProgressSummary({
  learnerCaps,
  totalCaps,
}: {
  learnerCaps: PDELearnerCapability[];
  totalCaps: number;
}) {
  const demonstrated = learnerCaps.filter(
    (c) => c.status === 'demonstrated' || c.status === 'mastered'
  ).length;
  const inProgress = learnerCaps.filter(
    (c) => c.status === 'in_progress'
  ).length;
  const mastered = learnerCaps.filter(
    (c) => c.status === 'mastered'
  ).length;

  const percentage = totalCaps > 0 ? Math.round((demonstrated / totalCaps) * 100) : 0;

  return (
    <Card className="bg-[#fbfbee]/50 dark:bg-card">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">My Progress</h3>
          <span className="text-sm font-semibold text-[#0b6d41]">
            {demonstrated}/{totalCaps} capabilities
          </span>
        </div>
        <Progress value={percentage} className="h-2 mb-3" />
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-amber-500">{inProgress}</p>
            <p className="text-[11px] text-muted-foreground">In Progress</p>
          </div>
          <div>
            <p className="text-lg font-bold text-[#0b6d41]">{demonstrated}</p>
            <p className="text-[11px] text-muted-foreground">Demonstrated</p>
          </div>
          <div>
            <p className="text-lg font-bold text-[#ffde59]">{mastered}</p>
            <p className="text-[11px] text-muted-foreground">Mastered</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Legend Component
// ============================================

function TreeLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {Object.entries(STATUS_CONFIG).map(([key, config]) => {
        const Icon = config.icon;
        return (
          <span key={key} className="flex items-center gap-1">
            <Icon className={cn('h-3 w-3', config.color)} />
            {config.label}
          </span>
        );
      })}
    </div>
  );
}

// ============================================
// Main Page
// ============================================

export default function CapabilityTreePage() {
  const { profile: user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<CapabilityCategory>('ai_fluency');

  const { data: allCapabilities, isLoading: capsLoading } = useCapabilities();
  const { data: learnerCapabilities, isLoading: learnerCapsLoading } = useLearnerCapabilities(user?.id);

  const isLoading = capsLoading || learnerCapsLoading;

  // Build learner status map
  const learnerStatusMap = useMemo(() => {
    const map = new Map<string, CapabilityStatus>();
    if (learnerCapabilities) {
      for (const lc of learnerCapabilities) {
        map.set(lc.capability_id, lc.status);
      }
    }
    return map;
  }, [learnerCapabilities]);

  // Group capabilities by category
  const categorized = useMemo(() => {
    if (!allCapabilities) return {};
    const groups: Partial<Record<CapabilityCategory, PDECapability[]>> = {};
    for (const cap of allCapabilities) {
      const cat = cap.category as CapabilityCategory;
      if (!groups[cat]) groups[cat] = [];
      groups[cat]!.push(cap);
    }
    return groups;
  }, [allCapabilities]);

  // Build tree for active category
  const treeNodes = useMemo(() => {
    const caps = categorized[activeCategory] || [];
    return buildTree(caps, learnerStatusMap);
  }, [categorized, activeCategory, learnerStatusMap]);

  // Count per category
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<CapabilityCategory, { total: number; demonstrated: number }>> = {};
    for (const [cat, caps] of Object.entries(categorized)) {
      const total = caps.length;
      const demonstrated = caps.filter(
        (c) => {
          const s = learnerStatusMap.get(c.id);
          return s === 'demonstrated' || s === 'mastered';
        }
      ).length;
      counts[cat as CapabilityCategory] = { total, demonstrated };
    }
    return counts;
  }, [categorized, learnerStatusMap]);

  // Available categories (only show tabs for categories that have capabilities)
  const availableCategories = Object.keys(categorized) as CapabilityCategory[];

  return (
    <ContentLayout title="Capability Tree">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Capability Tree' },
        ]}
      />

      <div className="mt-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <TreePine className="h-6 w-6 text-[#0b6d41]" />
              My Capability Tree
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your skill map. Non-linear. Learn capabilities in the order your quests demand.
            </p>
          </div>
        </div>

        {/* Progress summary */}
        {!isLoading && learnerCapabilities && (
          <ProgressSummary
            learnerCaps={learnerCapabilities}
            totalCaps={allCapabilities?.length || 0}
          />
        )}

        {/* Legend */}
        <TreeLegend />

        {/* Category tabs + tree */}
        {isLoading ? (
          <Card className="p-6 space-y-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3" style={{ paddingLeft: `${(i % 3) * 24}px` }}>
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-5 w-8" />
              </div>
            ))}
          </Card>
        ) : availableCategories.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <TreePine className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No capabilities defined yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Capabilities are being configured. Check back soon to see your skill tree.
            </p>
          </Card>
        ) : (
          <div>
            {/* Scrollable category tabs */}
            <Tabs
              value={activeCategory}
              onValueChange={(val) => setActiveCategory(val as CapabilityCategory)}
            >
              <div className="overflow-x-auto -mx-4 px-4 pb-2">
                <TabsList className="inline-flex h-auto p-1 gap-1">
                  {availableCategories.map((cat) => {
                    const config = CATEGORY_CONFIG[cat];
                    const Icon = config.icon;
                    const count = categoryCounts[cat];
                    return (
                      <TabsTrigger
                        key={cat}
                        value={cat}
                        className="text-xs px-3 py-2 gap-1.5 data-[state=active]:bg-[#0b6d41] data-[state=active]:text-white"
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">{config.label}</span>
                        <span className="sm:hidden">{config.label.split(' ')[0]}</span>
                        {count && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1 ml-0.5 data-[state=active]:bg-white/20 data-[state=active]:text-white"
                          >
                            {count.demonstrated}/{count.total}
                          </Badge>
                        )}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {/* Tree view for each category */}
              {availableCategories.map((cat) => (
                <TabsContent key={cat} value={cat} className="mt-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          {(() => {
                            const Icon = CATEGORY_CONFIG[cat].icon;
                            return <Icon className="h-4 w-4" />;
                          })()}
                          {CATEGORY_CONFIG[cat].label} Capabilities
                        </CardTitle>
                        {categoryCounts[cat] && (
                          <span className="text-xs text-muted-foreground">
                            {categoryCounts[cat]!.demonstrated} of {categoryCounts[cat]!.total} demonstrated
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {treeNodes.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          No capabilities in this category yet.
                        </p>
                      ) : (
                        <ul className="space-y-0.5">
                          {treeNodes.map((node, idx) => (
                            <CapabilityTreeNode
                              key={node.capability.id}
                              node={node}
                              depth={0}
                              isLast={idx === treeNodes.length - 1}
                              parentConnectors={[]}
                            />
                          ))}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
