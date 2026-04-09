'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateIncident } from '@/hooks/events/marathon/use-marathon-live-ops';
import { Plus } from 'lucide-react';
import type { IncidentType, IncidentSeverity } from '@/types/events-marathon';

interface IncidentFormProps {
  eventId: string;
}

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

export function IncidentForm({ eventId }: IncidentFormProps) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IncidentType>('medical');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [bibNumber, setBibNumber] = useState('');

  const createIncident = useCreateIncident();

  const handleSubmit = () => {
    if (!title.trim()) return;

    createIncident.mutate(
      {
        event_id: eventId,
        type,
        severity,
        title: title.trim(),
        description: description.trim() || undefined,
        location: location.trim() || undefined,
        bib_number: bibNumber.trim() || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          resetForm();
        },
      }
    );
  };

  const resetForm = () => {
    setType('medical');
    setSeverity('medium');
    setTitle('');
    setDescription('');
    setLocation('');
    setBibNumber('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Log Incident
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Log Incident</DialogTitle>
          <DialogDescription>
            Report a race day incident for the operations team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as IncidentType)}>
                <SelectTrigger className="h-9">
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
            <div className="space-y-1.5">
              <Label className="text-xs">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as IncidentSeverity)}
              >
                <SelectTrigger className="h-9">
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

          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief description of the incident"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description (optional)"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Location</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. KM 5 water station"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">BIB Number (optional)</Label>
              <Input
                value={bibNumber}
                onChange={(e) => setBibNumber(e.target.value)}
                placeholder="e.g. KBM-2026-10K-0042"
                className="h-9"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || createIncident.isPending}
          >
            {createIncident.isPending ? 'Reporting...' : 'Report Incident'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
