'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Users, Clock, Gauge, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WpPattern } from '@/types/work-pulse';

const STATUS_COLORS: Record<string, string> = {
  discovered: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  classified: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  queued: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  building: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  deployed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  measuring: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
};

const SOLUTION_LABELS: Record<string, string> = {
  new_module: 'New Module',
  standalone_agent: 'Standalone Agent',
  process_change: 'Process Change',
  training: 'Training',
};

interface PatternCardProps {
  pattern: WpPattern;
}

export function PatternCard({ pattern }: PatternCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="py-3 px-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-medium truncate">{pattern.name}</h4>
              <Badge className={`text-[10px] ${STATUS_COLORS[pattern.status] || ''}`}>
                {pattern.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {pattern.description}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-bold text-primary">
              {Number(pattern.impact_score).toFixed(0)}
            </span>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Summary metrics */}
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" /> {pattern.people_affected} people
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {Number(pattern.hours_wasted_weekly).toFixed(1)} hrs/wk
          </span>
          {pattern.feasibility_score && (
            <span className="flex items-center gap-1">
              <Gauge className="h-3 w-3" /> {pattern.feasibility_score}/10
            </span>
          )}
          {pattern.solution_type && (
            <span className="flex items-center gap-1">
              <Wrench className="h-3 w-3" /> {SOLUTION_LABELS[pattern.solution_type]}
            </span>
          )}
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 pt-3 border-t text-sm space-y-2">
            <p className="text-muted-foreground">{pattern.description}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium">Category:</span> {pattern.category}
              </div>
              <div>
                <span className="font-medium">Source:</span> {pattern.source}
              </div>
              {pattern.roles_affected && pattern.roles_affected.length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium">Roles affected:</span>{' '}
                  {pattern.roles_affected.join(', ')}
                </div>
              )}
              {pattern.jicate_product_candidate && (
                <div className="col-span-2">
                  <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                    JICATE Product Candidate
                  </Badge>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
