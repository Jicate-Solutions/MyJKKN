'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useResolveIncident } from '@/hooks/events/marathon/use-marathon-live-ops';
import { IncidentForm } from './incident-form';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { MarathonIncident, IncidentSeverity, IncidentStatus } from '@/types/events-marathon';

interface IncidentPanelProps {
  eventId: string;
  incidents: MarathonIncident[];
}

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<IncidentStatus, string> = {
  reported: 'bg-red-100 text-red-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-700',
};

export function IncidentPanel({ eventId, incidents }: IncidentPanelProps) {
  const [resolveId, setResolveId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const resolveIncident = useResolveIncident();

  const handleResolve = () => {
    if (!resolveId || !resolutionNotes.trim()) return;
    resolveIncident.mutate(
      { id: resolveId, resolutionNotes: resolutionNotes.trim() },
      {
        onSuccess: () => {
          setResolveId(null);
          setResolutionNotes('');
        },
      }
    );
  };

  return (
    <>
      <Card className="h-full">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Incidents
              {incidents.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  {incidents.length}
                </Badge>
              )}
            </CardTitle>
            <IncidentForm eventId={eventId} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2 overflow-auto max-h-[400px]">
            {incidents.length === 0 && (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-2 text-green-500" />
                <p className="text-sm">No active incidents</p>
              </div>
            )}
            {incidents.map((incident) => (
              <div
                key={incident.id}
                className="border rounded-lg p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{incident.title}</p>
                    {incident.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {incident.description}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] px-1.5 py-0 shrink-0 ${SEVERITY_COLORS[incident.severity]}`}
                  >
                    {incident.severity}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[incident.status]}`}
                    >
                      {incident.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {incident.type}
                    </span>
                    {incident.bib_number && (
                      <span className="text-[10px] font-mono text-muted-foreground">
                        BIB: {incident.bib_number}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}
                    </span>
                    {incident.status !== 'resolved' && incident.status !== 'closed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setResolveId(incident.id)}
                      >
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
                {incident.location && (
                  <p className="text-[10px] text-muted-foreground">
                    Location: {incident.location}
                  </p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={!!resolveId} onOpenChange={(open) => !open && setResolveId(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Resolve Incident</DialogTitle>
            <DialogDescription>
              Provide resolution notes for this incident.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="What was done to resolve this incident?"
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleResolve}
              disabled={!resolutionNotes.trim() || resolveIncident.isPending}
            >
              {resolveIncident.isPending ? 'Resolving...' : 'Resolve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
