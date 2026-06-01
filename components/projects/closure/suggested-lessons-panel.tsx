'use client';

/**
 * SuggestedLessonsPanel — read-only panel surfacing lessons from OTHER projects
 * of the same project_type_id.  No LLM call — simple Supabase read.
 *
 * The panel appears inside the LessonsSection when projectTypeId is non-null and
 * the DB has lessons for that type outside the current project.
 */

import { Lightbulb, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useSuggestedLessons } from '@/hooks/projects/use-closure';

interface SuggestedLessonsPanelProps {
  projectId: string;
  projectTypeId: string | null | undefined;
}

export function SuggestedLessonsPanel({ projectId, projectTypeId }: SuggestedLessonsPanelProps) {
  const { data: suggestions = [], isLoading } = useSuggestedLessons(projectId, projectTypeId);

  if (!projectTypeId) return null;
  if (!isLoading && suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800">
        <Lightbulb className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Lessons from similar projects
        </span>
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />}
      </div>

      {!isLoading && (
        <>
          <Separator className="bg-amber-200" />
          <ul className="space-y-3">
            {suggestions.map((s) => (
              <li key={s.id} className="space-y-1">
                {s.category && (
                  <Badge
                    variant="outline"
                    className="text-xs text-amber-700 border-amber-300 bg-amber-100"
                  >
                    {s.category}
                  </Badge>
                )}
                <p className="text-sm text-amber-900 leading-snug">{s.lesson}</p>
                {s.tags && s.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 border border-amber-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
