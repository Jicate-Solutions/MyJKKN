'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Phone,
  MapPin,
  School,
  Users,
  Calendar,
  FileText,
} from 'lucide-react';
import type { MarketingLeadDatabase } from '@/types/admission';

interface LeadDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: MarketingLeadDatabase | null;
}

function DetailField({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-words">
          {value || <span className="text-muted-foreground italic">Not provided</span>}
        </p>
      </div>
    </div>
  );
}

export function LeadDetailDialog({
  open,
  onOpenChange,
  lead,
}: LeadDetailDialogProps) {
  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Lead Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          {/* Personal Information */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Personal Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <DetailField
                icon={User}
                label="Student's Name"
                value={lead.student_name}
              />
              <DetailField
                icon={Users}
                label="Father's Name"
                value={lead.father_name}
              />
              <DetailField label="Gender" value={lead.gender} />
              <DetailField label="Community" value={lead.community} />
            </div>
          </div>

          <Separator />

          {/* Contact Information */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Contact
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <DetailField
                icon={Phone}
                label="Mobile Number"
                value={lead.mobile_number}
              />
              <DetailField
                icon={MapPin}
                label="Pincode"
                value={lead.pincode}
              />
            </div>
            <DetailField
              icon={MapPin}
              label="Address"
              value={lead.address}
            />
          </div>

          <Separator />

          {/* Location & Education */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Location & Education
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <DetailField
                icon={MapPin}
                label="District"
                value={lead.district}
              />
              <DetailField label="Sub District" value={lead.sub_district} />
              <DetailField
                icon={School}
                label="School Name"
                value={lead.school_name}
              />
              <DetailField
                icon={FileText}
                label="Group Detail"
                value={lead.group_detail}
              />
            </div>
          </div>

          <Separator />

          {/* Upload Info */}
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-1">
              Upload Information
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <DetailField
                icon={Calendar}
                label="Uploaded At"
                value={
                  lead.created_at
                    ? new Date(lead.created_at).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : null
                }
              />
              <DetailField
                icon={FileText}
                label="Source File"
                value={lead.upload_file_name}
              />
            </div>
            {lead.upload_batch_id && (
              <div className="mt-1">
                <p className="text-xs text-muted-foreground">Batch ID</p>
                <Badge variant="outline" className="font-mono text-xs mt-0.5">
                  {lead.upload_batch_id.slice(0, 8)}...
                </Badge>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
