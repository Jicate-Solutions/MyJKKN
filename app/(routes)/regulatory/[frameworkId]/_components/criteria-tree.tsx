'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  ChevronRight,
  ChevronDown,
  BookOpen,
  Layers,
  Target,
  ArrowRight,
} from 'lucide-react'

interface CriterionNode {
  id: string
  code: string
  name: string
  description?: string
  weight?: number
  max_score?: number
  score?: number
  completeness_pct?: number
  metric_count?: number
  parent_id?: string | null
  level?: number
  children?: CriterionNode[]
}

interface CriteriaTreeProps {
  criteria: CriterionNode[]
  frameworkId: string
}

// Build tree from flat list
function buildTree(items: CriterionNode[]): CriterionNode[] {
  const map = new Map<string, CriterionNode>()
  const roots: CriterionNode[] = []

  // Initialize all items in the map
  items.forEach((item) => {
    map.set(item.id, { ...item, children: [] })
  })

  // Build parent-child relationships
  items.forEach((item) => {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

function CriterionRow({
  node,
  depth,
  frameworkId,
}: {
  node: CriterionNode
  depth: number
  frameworkId: string
}) {
  const [expanded, setExpanded] = useState(depth < 1) // Auto-expand first level
  const hasChildren = node.children && node.children.length > 0

  return (
    <div>
      <div
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/50 ${
          depth === 0 ? 'bg-muted/30' : ''
        }`}
        style={{ marginLeft: `${depth * 24}px` }}
      >
        {/* Expand/Collapse Toggle */}
        <button
          onClick={() => hasChildren && setExpanded(!expanded)}
          className={`shrink-0 p-1 rounded hover:bg-muted ${
            hasChildren ? 'cursor-pointer' : 'cursor-default opacity-0'
          }`}
          disabled={!hasChildren}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {/* Criterion Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {node.code}
            </span>
            <span className={`font-medium text-sm truncate ${depth === 0 ? 'text-base' : ''}`}>
              {node.name}
            </span>
          </div>
          {node.description && depth === 0 && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {node.description}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Metric Count */}
          {node.metric_count != null && (
            <div className="text-center hidden sm:block">
              <p className="text-xs text-muted-foreground">Metrics</p>
              <p className="text-sm font-medium">{node.metric_count}</p>
            </div>
          )}

          {/* Weight */}
          {node.weight != null && (
            <div className="text-center hidden md:block">
              <p className="text-xs text-muted-foreground">Weight</p>
              <p className="text-sm font-medium">{node.weight}%</p>
            </div>
          )}

          {/* Completeness */}
          {node.completeness_pct != null && (
            <div className="w-20 hidden sm:block">
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-muted-foreground">Done</span>
                <span className={`font-medium ${
                  node.completeness_pct >= 80 ? 'text-emerald-600' :
                  node.completeness_pct >= 50 ? 'text-amber-600' : 'text-red-600'
                }`}>
                  {node.completeness_pct}%
                </span>
              </div>
              <Progress value={node.completeness_pct} className="h-1" />
            </div>
          )}

          {/* Score */}
          {node.score != null && (
            <Badge variant="outline" className="hidden sm:flex">
              <Target className="h-3 w-3 mr-1" />
              {node.score.toFixed(1)}
              {node.max_score ? `/${node.max_score}` : ''}
            </Badge>
          )}

          {/* Link to metrics */}
          {!hasChildren && (
            <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
              <Link href={`/regulatory/${frameworkId}/metrics?criteria=${node.id}`}>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="mt-1 space-y-1">
          {node.children!.map((child) => (
            <CriterionRow
              key={child.id}
              node={child}
              depth={depth + 1}
              frameworkId={frameworkId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CriteriaTree({ criteria, frameworkId }: CriteriaTreeProps) {
  const tree = useMemo(() => buildTree(criteria), [criteria])

  // Summary stats
  const totalCriteria = criteria.length
  const topLevel = tree.length
  const avgCompleteness = criteria.length > 0
    ? Math.round(
        criteria
          .filter((c) => c.completeness_pct != null)
          .reduce((sum, c) => sum + (c.completeness_pct || 0), 0) /
          Math.max(criteria.filter((c) => c.completeness_pct != null).length, 1)
      )
    : 0

  return (
    <div className="space-y-4">
      {/* Summary Bar */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-4 w-4" />
          {topLevel} main criteria
        </span>
        <span className="flex items-center gap-1.5">
          <Layers className="h-4 w-4" />
          {totalCriteria} total items
        </span>
        <span className="flex items-center gap-1.5">
          <Target className="h-4 w-4" />
          {avgCompleteness}% average completeness
        </span>
      </div>

      {/* Tree */}
      <div className="space-y-1">
        {tree.map((node) => (
          <CriterionRow
            key={node.id}
            node={node}
            depth={0}
            frameworkId={frameworkId}
          />
        ))}
      </div>
    </div>
  )
}
