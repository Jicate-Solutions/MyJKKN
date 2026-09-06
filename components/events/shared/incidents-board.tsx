'use client';

// components/events/shared/incidents-board.tsx
// Shared incident-log board for ANY event type (Events Platform Promotion PR4).
// Organizers log incidents (medical / logistics / security / weather / technical / other) with a
// severity, then resolve them with notes. Read-only when canManage is false.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, Trash2, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react';
import {
  useEventIncidents,
  useCreateIncident,
  useResolveIncident,
  useDeleteIncident,
} from '@/hooks/events/shared/use-event-volunteers';
import type {
  MarathonIncident,
  IncidentType,
  IncidentSeverity,
} from '@/types/events-marathon';

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: 'medical', label: 'Medical' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'security', label: 'Security' },
  { value: 'weather', label: 'Weather' },
  { value: 'technical', label: 'Technical' },
  { value: 'other', label: 'Other' },
];

const INCIDENT_SEVERITIES: { value: IncidentSeverity; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const SEVERITY_STYLES: Record<IncidentSeverity, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

function isOpen(status: string): boolean {
  return status !== 'resolved' && status !== 'closed';
}

function LogIncidentDialog({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const create = useCreateIncident(eventId);
  const [type, setType] = useState<IncidentType>('medical');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');

  const reset = () => {
    setType('medical');
    setSeverity('medium');
    setTitle('');
    setDescription('');
    setLocation('');
  };

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      {
        event_id: eventId,
        type,
        severity,
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Incident</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as IncidentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as IncidentSeverity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INCIDENT_SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Location</Label>
            <Input placeholder="Optional" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              placeholder="Optional"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || !title.trim()}>
            {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({
  incident,
  onClose,
  eventId,
}: {
  incident: MarathonIncident | null;
  onClose: () => void;
  eventId: string;
}) {
  const resolve = useResolveIncident(eventId);
  const [notes, setNotes] = useState('');
  const submit = () => {
    if (!incident) return;
    resolve.mutate(
      { id: incident.id, notes: notes.trim() },
      {
        onSuccess: () => {
          setNotes('');
          onClose();
        },
      }
    );
  };
  return (
    <Dialog open={!!incident} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Resolve Incident</DialogTitle>
        </DialogHeader>
        <p className="truncate text-sm text-muted-foreground">{incident?.title}</p>
        <div className="space-y-1 py-1">
          <Label className="text-xs">Resolution notes</Label>
          <Textarea
            rows={3}
            placeholder="What was done…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={resolve.isPending}>
            {resolve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Mark Resolved
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IncidentCard({
  incident,
  eventId,
  canManage,
  onResolve,
}: {
  incident: MarathonIncident;
  eventId: string;
  canManage: boolean;
  onResolve: (i: MarathonIncident) => void;
}) {
  const del = useDeleteIncident(eventId);
  const open = isOpen(incident.status);
  return (
    <Card>
      <CardContent className="space-y-2 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {open ? (
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              )}
              <span className="truncate font-semibold">{incident.title}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px] capitalize">
                {incident.type}
              </Badge>
              <Badge className={`text-[10px] capitalize ${SEVERITY_STYLES[incident.severity]}`}>
                {incident.severity}
              </Badge>
              {!open && (
                <Badge variant="outline" className="text-[10px]">
                  Resolved
                </Badge>
              )}
              {incident.location && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {incident.location}
                </span>
              )}
            </div>
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 p-0"
              disabled={del.isPending}
              onClick={() => del.mutate(incident.id)}
              title="Remove"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          )}
        </div>

        {incident.description && (
          <p className="text-xs text-muted-foreground">{incident.description}</p>
        )}
        {!open && incident.resolution_notes && (
          <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
            {incident.resolution_notes}
          </p>
        )}

        {canManage && open && (
          <div className="pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onResolve(incident)}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolve
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function IncidentsBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const { data: incidents, isLoading } = useEventIncidents(eventId);
  const [logOpen, setLogOpen] = useState(false);
  const [resolveFor, setResolveFor] = useState<MarathonIncident | null>(null);

  const rows = incidents ?? [];
  const openCount = rows.filter((i) => isOpen(i.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Incidents</h3>
          <p className="text-sm text-muted-foreground">
            On-the-day issue log. {openCount} open.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setLogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Log Incident
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No incidents logged{canManage ? ' — log one if something comes up.' : '.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((i) => (
            <IncidentCard
              key={i.id}
              incident={i}
              eventId={eventId}
              canManage={canManage}
              onResolve={(inc) => setResolveFor(inc)}
            />
          ))}
        </div>
      )}

      <LogIncidentDialog open={logOpen} onClose={() => setLogOpen(false)} eventId={eventId} />
      <ResolveDialog incident={resolveFor} onClose={() => setResolveFor(null)} eventId={eventId} />
    </div>
  );
}
