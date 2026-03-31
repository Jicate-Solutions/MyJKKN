'use client';

import { Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InstantHelpResult } from '@/types/work-pulse';

interface InstantHelpCardProps {
  result: InstantHelpResult;
}

export function InstantHelpCard({ result }: InstantHelpCardProps) {
  if (!result.top_pattern) {
    return (
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
        <CardContent className="flex items-start gap-3 py-4">
          <Sparkles className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Feedback recorded
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              {result.message}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusColors: Record<string, string> = {
    discovered: 'bg-gray-100 text-gray-800',
    classified: 'bg-blue-100 text-blue-800',
    queued: 'bg-yellow-100 text-yellow-800',
    building: 'bg-purple-100 text-purple-800',
    deployed: 'bg-green-100 text-green-800',
    measuring: 'bg-emerald-100 text-emerald-800',
  };

  return (
    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardContent className="flex items-start gap-3 py-4">
        <Sparkles className="h-5 w-5 text-amber-600 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            You&apos;re not alone!
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {result.message}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary" className="text-xs">
              {result.top_pattern.people_affected} people affected
            </Badge>
            <Badge
              className={`text-xs ${statusColors[result.top_pattern.status] || ''}`}
            >
              {result.top_pattern.status}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
