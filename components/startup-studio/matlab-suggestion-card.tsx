'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Lightbulb } from 'lucide-react';
import { MATLAB_TOOLBOX_MAP } from '@/lib/constants/startup-studio/matlab-toolbox-map';

interface MatlabSuggestionCardProps {
  workflowType: string | null;
}

export function MatlabSuggestionCard({ workflowType }: MatlabSuggestionCardProps) {
  if (!workflowType) return null;

  const mapping = MATLAB_TOOLBOX_MAP.find(
    (m) => m.workflowType === workflowType
  );

  if (!mapping) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-amber-900">
              MATLAB can help with this workflow
            </p>
            <div className="flex flex-wrap gap-1">
              {mapping.toolboxes.map((tb) => (
                <Badge key={tb} variant="outline" className="text-xs border-amber-300 text-amber-800">
                  {tb}
                </Badge>
              ))}
            </div>
            <a
              href={mapping.onrampUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 underline"
            >
              Free course: {mapping.onrampCourse}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
