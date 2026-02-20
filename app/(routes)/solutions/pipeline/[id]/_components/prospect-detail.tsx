'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  User,
  Phone,
  Mail,
  IndianRupee,
  CalendarClock,
  Clock,
  Tag,
  FileText,
  Hammer,
  BookOpen,
  Video,
  Loader2,
} from 'lucide-react';
import { format, differenceInDays, formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import {
  useProspect,
  useProspectActivities,
  useUpdatePipelineStage,
  useUpdateProspect,
  useDeleteProspect,
} from '@/hooks/solutions/use-prospects';
import { PipelineStageBadge } from '@/components/solutions/pipeline/pipeline-stage-badge';
import { ActivityTimeline } from '@/components/solutions/pipeline/activity-timeline';
import { LogActivityDialog } from '@/components/solutions/pipeline/log-activity-dialog';
import { LostReasonDialog } from '@/components/solutions/pipeline/lost-reason-dialog';
import { ConvertToClientDialog } from '@/components/solutions/pipeline/convert-to-client-dialog';
import { FileUpload } from '@/components/solutions/pipeline/file-upload';
import type { PipelineStage, SolutionType } from '@/lib/services/solutions/types';
import {
  PIPELINE_STAGE_LABELS,
} from '@/lib/services/solutions/prospects-service';

// ============================================
// HELPERS
// ============================================

function formatCurrency(amount: number | null | undefined): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

const SOURCE_LABELS: Record<string, string> = {
  placement: 'Placement Cell',
  alumni: 'Alumni Network',
  clinical: 'Clinical Partners',
  referral: 'Referral',
  direct: 'Direct Inquiry',
  yi: 'Young Indians (YI)',
  intent: 'Intent Agency',
};

const SOLUTION_CONFIG: Record<SolutionType, { icon: React.ElementType; label: string; color: string }> = {
  software: { icon: Hammer, label: 'Software', color: 'text-blue-600' },
  training: { icon: BookOpen, label: 'Training', color: 'text-green-600' },
  content: { icon: Video, label: 'Content', color: 'text-purple-600' },
};

// ============================================
// COMPONENT
// ============================================

interface ProspectDetailProps {
  prospectId: string;
}

export function ProspectDetail({ prospectId }: ProspectDetailProps) {
  const router = useRouter();
  const { data: prospect, isLoading } = useProspect(prospectId);
  const { data: activities, isLoading: activitiesLoading } =
    useProspectActivities(prospectId);
  const updateStage = useUpdatePipelineStage();
  const updateProspect = useUpdateProspect();
  const deleteProspect = useDeleteProspect();

  const [lostDialogOpen, setLostDialogOpen] = useState(false);
  const [wonDialogOpen, setWonDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-96" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Prospect not found</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/solutions/pipeline">Back to Pipeline</Link>
        </Button>
      </div>
    );
  }

  const daysSinceContact = prospect.last_contact_date
    ? differenceInDays(new Date(), new Date(prospect.last_contact_date))
    : null;

  const solutionConfig = prospect.solution_type_interest
    ? SOLUTION_CONFIG[prospect.solution_type_interest]
    : null;
  const SolutionIcon = solutionConfig?.icon;

  const handleStageChange = (newStage: string) => {
    const stage = newStage as PipelineStage;

    if (stage === 'lost') {
      setLostDialogOpen(true);
      return;
    }

    if (stage === 'won') {
      setWonDialogOpen(true);
      return;
    }

    updateStage.mutate(
      { id: prospectId, stage },
      {
        onSuccess: () => {
          toast.success(`Stage updated to ${PIPELINE_STAGE_LABELS[stage]}`);
        },
        onError: () => {
          toast.error('Failed to update stage');
        },
      }
    );
  };

  const handleLostConfirm = (reason: string) => {
    updateStage.mutate(
      { id: prospectId, stage: 'lost', lostReason: reason },
      {
        onSuccess: () => {
          toast.success('Prospect marked as lost');
          setLostDialogOpen(false);
        },
        onError: () => {
          toast.error('Failed to update stage');
        },
      }
    );
  };

  const handleDelete = () => {
    if (!confirm('Are you sure you want to delete this prospect?')) return;

    deleteProspect.mutate(prospectId, {
      onSuccess: () => {
        toast.success('Prospect deleted');
        router.push('/solutions/pipeline');
      },
      onError: () => {
        toast.error('Failed to delete prospect');
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/solutions/pipeline">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{prospect.company_name}</h1>
              <PipelineStageBadge stage={prospect.pipeline_stage} />
            </div>
            <p className="text-sm text-muted-foreground font-mono">
              {prospect.prospect_code}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stage change dropdown */}
          <Select
            value={prospect.pipeline_stage}
            onValueChange={handleStageChange}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PIPELINE_STAGE_LABELS) as [PipelineStage, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" asChild>
            <Link href={`/solutions/pipeline/${prospectId}/edit`}>
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Link>
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleDelete}
            disabled={deleteProspect.isPending}
          >
            {deleteProspect.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Activity timeline (60%) */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Activity Timeline</CardTitle>
              <LogActivityDialog prospectId={prospectId} />
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16" />
                  ))}
                </div>
              ) : (
                <ActivityTimeline activities={activities || []} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Info cards (40%) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Prospect Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prospect Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                icon={Building2}
                label="Company"
                value={prospect.company_name}
              />
              <InfoRow
                icon={User}
                label="Contact"
                value={prospect.contact_person}
              />
              {prospect.contact_email && (
                <InfoRow icon={Mail} label="Email" value={prospect.contact_email} />
              )}
              <InfoRow
                icon={Phone}
                label="Phone"
                value={prospect.contact_phone}
              />
              <InfoRow
                icon={Tag}
                label="Source"
                value={SOURCE_LABELS[prospect.source_type] || prospect.source_type}
              />
              {prospect.source_detail && (
                <InfoRow icon={FileText} label="Source Detail" value={prospect.source_detail} />
              )}
              {solutionConfig && SolutionIcon && (
                <div className="flex items-center gap-3 text-sm">
                  <SolutionIcon className={cn('h-4 w-4 shrink-0', solutionConfig.color)} />
                  <span className="text-muted-foreground">Interest:</span>
                  <span className="font-medium">{solutionConfig.label}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pipeline Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pipeline Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow
                icon={IndianRupee}
                label="Deal Size"
                value={formatCurrency(prospect.expected_deal_size)}
              />
              {prospect.expected_close_date && (
                <InfoRow
                  icon={CalendarClock}
                  label="Expected Close"
                  value={format(new Date(prospect.expected_close_date), 'MMM d, yyyy')}
                />
              )}
              {prospect.assigned_user && (
                <InfoRow
                  icon={User}
                  label="Assigned To"
                  value={prospect.assigned_user.full_name}
                />
              )}
              {prospect.converted_client && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-green-600 shrink-0" />
                  <span className="text-muted-foreground">Converted to:</span>
                  <Link
                    href={`/solutions/clients/${prospect.converted_client.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    {prospect.converted_client.name}
                  </Link>
                </div>
              )}
              {prospect.lost_reason && (
                <div className="text-sm bg-red-50 border border-red-200 rounded-md p-3 mt-2">
                  <p className="text-red-700 font-medium text-xs mb-1">Lost Reason</p>
                  <p className="text-red-600">{prospect.lost_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <FileUpload
                entityType="prospect"
                entityId={prospectId}
                currentUrl={prospect.proposal_url ?? undefined}
                currentFilename={prospect.proposal_filename ?? undefined}
                onUploadComplete={(url, filename) => {
                  updateProspect.mutate(
                    { id: prospectId, input: { proposal_url: url, proposal_filename: filename } },
                    {
                      onSuccess: () => toast.success('Proposal document saved'),
                      onError: () => toast.error('Failed to save document'),
                    }
                  );
                }}
                onDelete={() => {
                  updateProspect.mutate(
                    { id: prospectId, input: { proposal_url: '', proposal_filename: '' } },
                    {
                      onSuccess: () => toast.success('Document removed'),
                      onError: () => toast.error('Failed to remove document'),
                    }
                  );
                }}
              />
            </CardContent>
          </Card>

          {/* Follow-up Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Follow-up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {prospect.next_action ? (
                <div className="space-y-2">
                  <p className="text-sm">
                    <span className="font-medium">Next Action:</span>{' '}
                    {prospect.next_action}
                  </p>
                  {prospect.next_action_date && (
                    <p className="text-sm text-muted-foreground">
                      Due: {format(new Date(prospect.next_action_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No next action scheduled
                </p>
              )}

              {prospect.last_contact_date && (
                <div
                  className={cn(
                    'flex items-center gap-2 text-sm pt-2 border-t',
                    daysSinceContact !== null && daysSinceContact > 7
                      ? 'text-red-600'
                      : 'text-muted-foreground'
                  )}
                >
                  <Clock className="h-4 w-4" />
                  <span>
                    Last contact:{' '}
                    {formatDistanceToNow(new Date(prospect.last_contact_date), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes Card */}
          {prospect.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {prospect.notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Tags */}
          {prospect.tags && prospect.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tags</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {prospect.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Lost Reason Dialog */}
      <LostReasonDialog
        open={lostDialogOpen}
        onOpenChange={setLostDialogOpen}
        onConfirm={handleLostConfirm}
        isLoading={updateStage.isPending}
        prospectName={prospect.company_name}
      />

      {/* Convert to Client Dialog */}
      <ConvertToClientDialog
        open={wonDialogOpen}
        onOpenChange={setWonDialogOpen}
        prospect={prospect}
      />
    </div>
  );
}

// ============================================
// INFO ROW SUBCOMPONENT
// ============================================

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
