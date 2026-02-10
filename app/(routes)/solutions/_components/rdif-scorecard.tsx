'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RDIFPrerequisite {
  id: string;
  name: string;
  met: boolean;
  evidence?: string;
  targetDate?: string;
  lastUpdated?: string;
}

interface RDIFScorecardProps {
  prerequisites: RDIFPrerequisite[];
  showDetails?: boolean;
  className?: string;
}

export function RDIFScorecard({ prerequisites, showDetails = false, className }: RDIFScorecardProps) {
  const metCount = prerequisites.filter((p) => p.met).length;
  const totalCount = prerequisites.length;
  const percentage = Math.round((metCount / totalCount) * 100);

  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">RDIF Readiness</CardTitle>
          <Badge
            variant={metCount >= 7 ? 'default' : metCount >= 4 ? 'secondary' : 'outline'}
            className={cn(
              'text-base px-3 py-1',
              metCount >= 7 && 'bg-green-500',
              metCount >= 4 && metCount < 7 && 'bg-yellow-500',
              metCount < 4 && 'bg-red-100 text-red-800'
            )}
          >
            {metCount} of {totalCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Circle */}
        <div className="flex items-center justify-center mb-6">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-gray-200"
              />
              {/* Progress circle */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={`${percentage * 2.51327} 251.327`}
                className={cn(
                  'transition-all duration-500',
                  metCount >= 7 && 'text-green-500',
                  metCount >= 4 && metCount < 7 && 'text-yellow-500',
                  metCount < 4 && 'text-red-500'
                )}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{percentage}%</span>
              <span className="text-xs text-muted-foreground">Ready</span>
            </div>
          </div>
        </div>

        {/* Prerequisites List */}
        {showDetails && (
          <div className="space-y-2">
            {prerequisites.map((prereq) => (
              <div
                key={prereq.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border',
                  prereq.met ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                )}
              >
                <div className={cn(
                  'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center',
                  prereq.met ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                )}>
                  {prereq.met ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium',
                    prereq.met ? 'text-green-900' : 'text-gray-900'
                  )}>
                    {prereq.name}
                  </p>
                  {prereq.evidence && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {prereq.evidence}
                    </p>
                  )}
                  {!prereq.met && prereq.targetDate && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Target: {prereq.targetDate}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Summary (if not showing details) */}
        {!showDetails && (
          <div className="space-y-1">
            {prerequisites.slice(0, 3).map((prereq) => (
              <div key={prereq.id} className="flex items-center gap-2 text-sm">
                {prereq.met ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-gray-400" />
                )}
                <span className={cn(prereq.met ? 'text-foreground' : 'text-muted-foreground')}>
                  {prereq.name}
                </span>
              </div>
            ))}
            {prerequisites.length > 3 && (
              <p className="text-xs text-muted-foreground mt-2">
                +{prerequisites.length - 3} more prerequisites
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
