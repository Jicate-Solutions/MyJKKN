'use client';

/**
 * VersionHistory — inline panel showing the supersedes_id chain for a document.
 *
 * Renders oldest-first (root at top, latest at bottom) in a compact timeline.
 * Used as an overlay/card inside DocumentList; not a modal.
 */

import { X, GitBranch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useVersionHistory } from '@/hooks/projects/use-documents';

interface VersionHistoryProps {
  attachmentId: string;
  onClose: () => void;
}

export function VersionHistory({ attachmentId, onClose }: VersionHistoryProps) {
  const { data: versions, isLoading, error } = useVersionHistory(attachmentId);

  return (
    <Card className="mt-4 border-border/60">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <GitBranch className="h-4 w-4" />
          Version history
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 ${TAP_TARGET_ICON}`}
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history…
          </div>
        )}
        {error && (
          <p className="py-2 text-sm text-destructive">
            Could not load version history: {String(error)}
          </p>
        )}
        {!isLoading && !error && versions && (
          <ol className="relative border-l border-border/50 ml-2 space-y-3">
            {versions.map((v, idx) => {
              const isLatest = idx === versions.length - 1;
              return (
                <li key={v.id} className="ml-4">
                  {/* timeline dot */}
                  <span
                    className={`absolute -left-[5px] mt-[5px] h-2.5 w-2.5 rounded-full border-2 border-background ${
                      isLatest ? 'bg-primary' : 'bg-muted-foreground/40'
                    }`}
                  />
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{v.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant={isLatest ? 'default' : 'outline'} className="text-xs">
                        v{v.version}
                      </Badge>
                      {v.is_final_report && (
                        <Badge variant="secondary" className="text-xs">
                          Final
                        </Badge>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {!isLoading && !error && versions?.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No version data found.</p>
        )}
      </CardContent>
    </Card>
  );
}
