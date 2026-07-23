'use client';

/**
 * DecisionLog — list and add decision entries for a project.
 *
 * Reads from project_activity_feed WHERE entity_type='decision'.
 * Renders a feed-style list with event_type + summary + detail, and an
 * inline "Add decision" form.
 */

import { useState } from 'react';
import { Gavel, Plus, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useDecisions, useAddDecision } from '@/hooks/projects/use-documents';

interface DecisionLogProps {
  projectId: string;
}

export function DecisionLog({ projectId }: DecisionLogProps) {
  const { data: decisions, isLoading, error } = useDecisions(projectId);
  const addDecision = useAddDecision();

  const [showForm, setShowForm] = useState(false);
  const [eventType, setEventType] = useState('');
  const [summary, setSummary] = useState('');
  const [detailText, setDetailText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!eventType.trim() || !summary.trim()) return;

    let detail: Record<string, unknown> = {};
    if (detailText.trim()) {
      try {
        detail = JSON.parse(detailText);
      } catch {
        detail = { notes: detailText.trim() };
      }
    }

    await addDecision.mutateAsync({
      project_id: projectId,
      event_type: eventType.trim(),
      summary: summary.trim(),
      detail,
      actor_id: null, // deferred: wire auth helper
    });

    setEventType('');
    setSummary('');
    setDetailText('');
    setShowForm(false);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Gavel className="h-4 w-4" />
          Decision log
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setShowForm((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          Add decision
        </Button>
      </div>

      {/* Add-decision form */}
      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="dec-type">Decision type / category</Label>
                <Input
                  id="dec-type"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  placeholder="e.g. scope_change, vendor_selection, go_nogo"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dec-summary">Summary</Label>
                <Input
                  id="dec-summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="One-line decision summary"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dec-detail">
                  Detail{' '}
                  <span className="text-muted-foreground font-normal">
                    (plain text or JSON — optional)
                  </span>
                </Label>
                <Textarea
                  id="dec-detail"
                  value={detailText}
                  onChange={(e) => setDetailText(e.target.value)}
                  placeholder='{"rationale":"…","decided_by":"…"}'
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={addDecision.isPending || !eventType.trim() || !summary.trim()}
                >
                  {addDecision.isPending && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  Save decision
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Decision feed */}
      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading decisions…
        </div>
      )}
      {error && (
        <p className="py-2 text-sm text-destructive">
          Failed to load decisions: {String(error)}
        </p>
      )}
      {!isLoading && !error && decisions && decisions.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No decisions logged yet.
        </p>
      )}
      {!isLoading &&
        !error &&
        decisions &&
        decisions.length > 0 && (
          <ol className="relative border-l border-border/50 ml-3 space-y-4">
            {decisions.map((d) => {
              const isExpanded = expandedId === d.id;
              const hasDetail =
                d.detail && Object.keys(d.detail).length > 0;

              return (
                <li key={d.id} className="ml-5">
                  <span className="absolute -left-[5px] mt-[6px] h-2.5 w-2.5 rounded-full bg-primary/70 border-2 border-background" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {d.event_type}
                        </Badge>
                        <p className="text-sm font-medium">{d.summary}</p>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(d.created_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>

                      {/* Expandable detail */}
                      {hasDetail && (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpandedId(isExpanded ? null : d.id)}
                            className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3 w-3" />
                            ) : (
                              <ChevronRight className="h-3 w-3" />
                            )}
                            {isExpanded ? 'Hide detail' : 'Show detail'}
                          </button>
                          {isExpanded && (
                            <pre className="mt-2 rounded-md bg-muted p-2 text-xs overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(d.detail, null, 2)}
                            </pre>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
    </div>
  );
}
