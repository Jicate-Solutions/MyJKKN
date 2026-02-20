'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Building2, User, Mail, Phone, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { useUpdatePipelineStage } from '@/hooks/solutions/use-prospects';
import type { Prospect } from '@/lib/services/solutions/types';

interface ConvertToClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospect: Prospect | null;
}

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ConvertToClientDialog({
  open,
  onOpenChange,
  prospect,
}: ConvertToClientDialogProps) {
  const router = useRouter();
  const updateStage = useUpdatePipelineStage();

  const handleConfirm = () => {
    if (!prospect) return;

    updateStage.mutate(
      { id: prospect.id, stage: 'won' },
      {
        onSuccess: (data) => {
          onOpenChange(false);
          if (data?.converted_client_id) {
            toast.success('Prospect converted! Client created successfully.', {
              action: {
                label: 'View Client',
                onClick: () =>
                  router.push(`/solutions/clients/${data.converted_client_id}`),
              },
            });
          } else {
            toast.success('Prospect marked as Won');
          }
        },
        onError: () => {
          toast.error('Failed to convert prospect');
        },
      }
    );
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Convert to Client</DialogTitle>
          <DialogDescription>
            Converting this prospect will automatically create a new client
            record and mark this prospect as Won.
          </DialogDescription>
        </DialogHeader>

        {prospect && (
          <div className="py-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Company:</span>
                <span className="font-medium">{prospect.company_name}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Contact:</span>
                <span className="font-medium">{prospect.contact_person}</span>
              </div>
              {prospect.contact_email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{prospect.contact_email}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium">{prospect.contact_phone}</span>
              </div>
              {prospect.expected_deal_size && (
                <div className="flex items-center gap-3 text-sm">
                  <IndianRupee className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Deal Size:</span>
                  <span className="font-medium">
                    {formatCurrency(prospect.expected_deal_size)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={updateStage.isPending}>
            {updateStage.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Convert to Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
