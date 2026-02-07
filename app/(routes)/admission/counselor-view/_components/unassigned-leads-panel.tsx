'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, AlertCircle } from 'lucide-react';
import type { UnassignedLead } from '@/lib/services/admission/counselor-daily-view-service';

interface UnassignedLeadsPanelProps {
  leads: UnassignedLead[];
  counselors: Array<{ id: string; name: string; email: string }>;
  onAssign: (leadIds: string[], counselorId: string) => void;
  isAssigning?: boolean;
  isLoading?: boolean;
}

export function UnassignedLeadsPanel({
  leads,
  counselors,
  onAssign,
  isAssigning,
  isLoading,
}: UnassignedLeadsPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCounselor, setSelectedCounselor] = useState('');

  const toggleLead = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const handleAssign = () => {
    if (selectedIds.size > 0 && selectedCounselor) {
      onAssign(Array.from(selectedIds), selectedCounselor);
      setSelectedIds(new Set());
      setSelectedCounselor('');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-32 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (leads.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          Unassigned Leads ({leads.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Assign controls */}
        <div className="flex items-center gap-2 mb-3">
          <Checkbox
            checked={selectedIds.size === leads.length && leads.length > 0}
            onCheckedChange={toggleAll}
          />
          <span className="text-xs text-muted-foreground">
            {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
          </span>
          <div className="flex-1" />
          <Select value={selectedCounselor} onValueChange={setSelectedCounselor}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Assign to..." />
            </SelectTrigger>
            <SelectContent>
              {counselors.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleAssign}
            disabled={selectedIds.size === 0 || !selectedCounselor || isAssigning}
          >
            <UserPlus className="h-3 w-3 mr-1" />
            Assign
          </Button>
        </div>

        {/* Lead list */}
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {leads.map((lead) => (
            <div
              key={lead.id}
              className="flex items-center gap-2 p-2 rounded-md bg-background border text-xs"
            >
              <Checkbox
                checked={selectedIds.has(lead.id)}
                onCheckedChange={() => toggleLead(lead.id)}
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium">{lead.full_name}</span>
                {lead.interested_programs?.length ? (
                  <span className="text-muted-foreground ml-2 truncate">
                    {lead.interested_programs[0]}
                  </span>
                ) : null}
              </div>
              {lead.source && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {lead.source}
                </Badge>
              )}
              {lead.score != null && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {lead.score}
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
