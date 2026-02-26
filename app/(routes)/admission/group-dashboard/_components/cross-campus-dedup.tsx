'use client';

import { Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCrossCampusDuplicates } from '@/hooks/admission/use-group-dashboard';

export function CrossCampusDedup() {
  const { data: duplicates, isLoading, isError } = useCrossCampusDuplicates();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          Cross-Campus Duplicates
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Could not check for duplicates.</p>
        ) : !duplicates || duplicates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No cross-campus duplicates found.
          </p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {duplicates.slice(0, 20).map((dup, idx) => (
              <div
                key={`${dup.lead_1_id}-${dup.lead_2_id}-${idx}`}
                className="flex items-center justify-between border-b pb-2 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{dup.full_name}</p>
                  <p className="text-xs text-muted-foreground">{dup.phone}</p>
                </div>
                <Badge variant={dup.confidence >= 0.95 ? 'destructive' : 'secondary'}>
                  {Math.round(dup.confidence * 100)}% match
                </Badge>
              </div>
            ))}
            {duplicates.length > 20 && (
              <p className="text-xs text-muted-foreground text-center">
                +{duplicates.length - 20} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
