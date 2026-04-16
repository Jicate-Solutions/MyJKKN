'use client';

// ============================================================================
// ABCD Matrix Component
// 2x2 grid visualization for process vs. result analysis
// ============================================================================

import { useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Search,
  AlertTriangle,
  AlertOctagon,
  Target,
  ArrowRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  ABCDAnalysis,
  ABCD_CATEGORY_CONFIG,
  PROCESS_RATING_LABELS
} from '@/types/okr';

interface ABCDMatrixProps {
  data: ABCDAnalysis[];
  isLoading?: boolean;
  showDetails?: boolean;
}

// Icons for each category
const CategoryIcons = {
  A: CheckCircle2,
  B: Search,
  C: AlertTriangle,
  D: AlertOctagon
};

export function ABCDMatrix({ data, isLoading, showDetails = true }: ABCDMatrixProps) {
  // Group data by category
  const grouped = useMemo(() => {
    const groups: Record<string, ABCDAnalysis[]> = {
      A: [],
      B: [],
      C: [],
      D: []
    };

    data.forEach((item) => {
      if (item.abcd_category && groups[item.abcd_category]) {
        groups[item.abcd_category].push(item);
      }
    });

    return groups;
  }, [data]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Matrix Header */}
      <div className="grid grid-cols-3 gap-2 text-center text-sm font-medium">
        <div></div>
        <div className="text-emerald-700">Good Result (70%+)</div>
        <div className="text-red-700">Poor Result (&lt;70%)</div>
      </div>

      {/* Matrix Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Row Labels */}
        <div className="flex flex-col justify-around py-4">
          <div className="text-sm font-medium text-emerald-700 text-right pr-2">
            Good Process (4-5)
          </div>
          <div className="text-sm font-medium text-red-700 text-right pr-2">
            Poor Process (1-3)
          </div>
        </div>

        {/* Top Row: A (Good/Good) and B (Good Process/Poor Result) */}
        <QuadrantCard
          category="A"
          items={grouped.A}
          showDetails={showDetails}
        />
        <QuadrantCard
          category="B"
          items={grouped.B}
          showDetails={showDetails}
        />

        {/* Empty cell for alignment */}
        <div></div>

        {/* Bottom Row: D (Poor Process/Good Result) and C (Poor/Poor) */}
        <QuadrantCard
          category="D"
          items={grouped.D}
          showDetails={showDetails}
          isDanger
        />
        <QuadrantCard
          category="C"
          items={grouped.C}
          showDetails={showDetails}
        />
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-6">
        {(['A', 'B', 'C', 'D'] as const).map((cat) => {
          const config = ABCD_CATEGORY_CONFIG[cat];
          const Icon = CategoryIcons[cat];
          return (
            <div
              key={cat}
              className={cn(
                'p-3 rounded-lg border',
                config.bgColor,
                config.borderColor
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className={cn('h-5 w-5', config.color)} />
                <span className={cn('font-semibold', config.color)}>
                  {cat}: {grouped[cat].length}
                </span>
              </div>
              <p className={cn('text-xs mt-1', config.color)}>
                {config.label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Individual quadrant card
function QuadrantCard({
  category,
  items,
  showDetails,
  isDanger = false
}: {
  category: 'A' | 'B' | 'C' | 'D';
  items: ABCDAnalysis[];
  showDetails: boolean;
  isDanger?: boolean;
}) {
  const config = ABCD_CATEGORY_CONFIG[category];
  const Icon = CategoryIcons[category];

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all',
        config.bgColor,
        config.borderColor,
        'border-2',
        isDanger && 'ring-2 ring-red-500 ring-offset-2 animate-pulse'
      )}
    >
      {/* Category Badge */}
      <div
        className={cn(
          'absolute top-2 right-2 h-8 w-8 rounded-full flex items-center justify-center font-bold text-lg',
          category === 'A' && 'bg-emerald-600 text-white',
          category === 'B' && 'bg-blue-600 text-white',
          category === 'C' && 'bg-amber-600 text-white',
          category === 'D' && 'bg-red-600 text-white'
        )}
      >
        {category}
      </div>

      <CardHeader className="pb-2">
        <CardTitle className={cn('text-sm flex items-center gap-2', config.color)}>
          <Icon className="h-4 w-4" />
          {config.label}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </CardHeader>

      <CardContent>
        {/* Count */}
        <div className="text-3xl font-bold mb-2">{items.length}</div>
        <p className={cn('text-xs', config.color)}>{config.action}</p>

        {/* Items List (if showing details) */}
        {showDetails && items.length > 0 && (
          <div className="mt-3 space-y-2 max-h-32 overflow-y-auto">
            {items.slice(0, 5).map((item) => (
              <Link
                key={item.key_result_id}
                href={`/okr/objectives/${item.objective_id}`}
                className="block p-2 bg-white/50 rounded text-xs hover:bg-white/80 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.key_result_title}</p>
                    <p className="text-muted-foreground truncate">
                      {item.objective_title}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-medium">{Math.round(item.progress)}%</div>
                    <div className="text-muted-foreground">
                      P:{item.process_rating}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {items.length > 5 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{items.length - 5} more
              </p>
            )}
          </div>
        )}

        {items.length === 0 && (
          <p className="text-xs text-muted-foreground mt-3 italic">
            No items in this category
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Compact matrix for dashboard widgets
export function ABCDMatrixCompact({ data, isLoading }: { data: ABCDAnalysis[]; isLoading?: boolean }) {
  const counts = useMemo(() => {
    const result = { A: 0, B: 0, C: 0, D: 0 };
    data.forEach((item) => {
      if (item.abcd_category) {
        result[item.abcd_category as keyof typeof result]++;
      }
    });
    return result;
  }, [data]);

  if (isLoading) {
    return <Skeleton className="h-24" />;
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {(['A', 'B', 'C', 'D'] as const).map((cat) => {
        const config = ABCD_CATEGORY_CONFIG[cat];
        const Icon = CategoryIcons[cat];
        return (
          <div
            key={cat}
            className={cn(
              'p-3 rounded-lg border text-center',
              config.bgColor,
              config.borderColor
            )}
          >
            <Icon className={cn('h-5 w-5 mx-auto mb-1', config.color)} />
            <div className={cn('text-2xl font-bold', config.color)}>
              {counts[cat]}
            </div>
            <div className="text-xs font-medium">{cat}</div>
          </div>
        );
      })}
    </div>
  );
}

export default ABCDMatrix;
