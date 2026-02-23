'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Link as LinkIcon,
  CheckCircle2,
  Clock,
  ExternalLink,
  UserPlus,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useLeadAttributions, useConsultantsForDropdown } from '@/hooks/admission/use-consultants';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { AttributionType } from '@/types/education-consultants';

interface ConsultantAttributionCardProps {
  leadId: string;
  institutionId: string;
}

export function ConsultantAttributionCard({
  leadId,
  institutionId,
}: ConsultantAttributionCardProps) {
  const queryClient = useQueryClient();

  // Dialog state
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedConsultantId, setSelectedConsultantId] = useState('');
  const [attributionType, setAttributionType] = useState<AttributionType>('primary');
  const [isLinking, setIsLinking] = useState(false);

  // Data
  const { attributions, isLoading } = useLeadAttributions(leadId);
  const { data: consultants = [], isLoading: consultantsLoading } =
    useConsultantsForDropdown(institutionId);

  const handleCloseDialog = (open: boolean) => {
    setShowLinkDialog(open);
    if (!open) {
      setSelectedConsultantId('');
      setAttributionType('primary');
    }
  };

  const handleLink = async () => {
    if (!selectedConsultantId) {
      toast.error('Please select a consultant');
      return;
    }
    setIsLinking(true);
    try {
      await ConsultantService.createLeadAttribution({
        institution_id: institutionId,
        lead_id: leadId,
        consultant_id: selectedConsultantId,
        attribution_type: attributionType,
        attribution_percentage: 100,
      });
      toast.success('Consultant linked successfully');
      queryClient.invalidateQueries({ queryKey: ['lead-attributions', leadId] });
      handleCloseDialog(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to link consultant');
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <>
      {/* Attribution display card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <LinkIcon className="h-4 w-4" />
              Consultant Attribution
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLinkDialog(true)}
            >
              <UserPlus className="h-3.5 w-3.5 mr-1.5" />
              Link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : attributions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No consultant linked</p>
          ) : (
            <div className="space-y-3">
              {attributions.map((attribution) => (
                <div
                  key={attribution.id}
                  className="flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {attribution.consultant?.name || 'Unknown'}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">
                        {attribution.attribution_type}
                      </Badge>
                      {attribution.is_verified ? (
                        <Badge className="text-xs bg-green-100 text-green-800 gap-1">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Verified
                        </Badge>
                      ) : (
                        <Badge className="text-xs bg-yellow-100 text-yellow-800 gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                  {attribution.consultant_id && (
                    <Link href={`/admission/consultants/${attribution.consultant_id}`}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link consultant dialog */}
      <Dialog open={showLinkDialog} onOpenChange={handleCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link to Consultant</DialogTitle>
            <DialogDescription>
              Attribute this lead to an education consultant
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Consultant selector */}
            <div className="space-y-2">
              <Label>Consultant *</Label>
              <Select
                value={selectedConsultantId}
                onValueChange={setSelectedConsultantId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a consultant..." />
                </SelectTrigger>
                <SelectContent>
                  {consultantsLoading ? (
                    <SelectItem value="_loading" disabled>
                      Loading...
                    </SelectItem>
                  ) : consultants.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No active consultants found
                    </SelectItem>
                  ) : (
                    consultants.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Attribution type radio */}
            <div className="space-y-2">
              <Label>Attribution Type *</Label>
              <RadioGroup
                value={attributionType}
                onValueChange={(v) => setAttributionType(v as AttributionType)}
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="primary" id="attr-primary" />
                  <Label htmlFor="attr-primary" className="font-normal cursor-pointer">
                    Primary
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="secondary" id="attr-secondary" />
                  <Label htmlFor="attr-secondary" className="font-normal cursor-pointer">
                    Secondary
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="assist" id="attr-assist" />
                  <Label htmlFor="attr-assist" className="font-normal cursor-pointer">
                    Assist
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleCloseDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleLink}
              disabled={isLinking || !selectedConsultantId}
            >
              {isLinking ? 'Linking...' : 'Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
