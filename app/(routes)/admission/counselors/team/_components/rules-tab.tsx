'use client';

// rules-tab.tsx
// Tab 4: Read-only display of admission_assignment_rules.
// Edit/CRUD lives at /admission/settings/assignment-rules — linked from here.

import { useCounselorTeamRules } from '@/hooks/admission/use-counselor-team-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ListFilter, ExternalLink, AlertCircle, CheckCircle2, PauseCircle } from 'lucide-react';
import Link from 'next/link';

interface RulesTabProps {
  institutionId: string | undefined;
}

export function RulesTab({ institutionId }: RulesTabProps) {
  const { data: rules = [], isLoading, error } = useCounselorTeamRules(institutionId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row with link to editor */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rules.length > 0
            ? `${rules.length} rule${rules.length !== 1 ? 's' : ''} — ordered by priority`
            : 'No rules configured'}
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admission/settings/assignment-rules">
            <ExternalLink className="mr-2 h-4 w-4" />
            Edit in Settings
          </Link>
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <ListFilter className="mb-4 h-12 w-12 opacity-40" />
          <p className="font-medium">No assignment rules yet</p>
          <p className="mt-1 text-sm max-w-sm">
            Create rules to automatically assign incoming leads to counselors based on source,
            program, location, or workload.
          </p>
          <Button variant="default" size="sm" className="mt-4" asChild>
            <Link href="/admission/settings/assignment-rules">
              Create First Rule
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <Card key={rule.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                      {idx + 1}
                    </span>
                    <CardTitle className="text-sm font-semibold">{rule.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {rule.is_active ? (
                      <Badge className="bg-green-100 text-green-700 text-xs">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        <PauseCircle className="mr-1 h-3 w-3" />
                        Paused
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      Priority {rule.priority}
                    </Badge>
                  </div>
                </div>
                {rule.description && (
                  <CardDescription className="text-xs mt-1 ml-8">
                    {rule.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0 ml-8">
                <p className="text-xs text-muted-foreground">
                  Last updated:{' '}
                  {new Date(rule.updated_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
