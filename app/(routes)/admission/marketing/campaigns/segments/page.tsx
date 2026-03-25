'use client';

import { useState, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import {
  useWASegments,
  useWASegmentPreview,
  useWASegmentMutations,
} from '@/hooks/admission/use-wa-segments';
import type { SegmentCriterion } from '@/lib/services/whatsapp/whatsapp-segment-service';
import {
  Users,
  Filter,
  Plus,
  Trash2,
  Eye,
  RefreshCw,
  Pencil,
  Loader2,
  Zap,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { AdmissionErrorBoundary } from '@/components/admission';

// =============================================================================
// SEGMENT FIELD DEFINITIONS
// =============================================================================

interface FieldDef {
  value: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'date';
  options?: { value: string; label: string }[];
}

const SEGMENT_FIELDS: FieldDef[] = [
  { value: 'full_name', label: 'Full Name', type: 'text' },
  { value: 'email', label: 'Email', type: 'text' },
  { value: 'phone', label: 'Phone', type: 'text' },
  {
    value: 'funnel_stage', label: 'Funnel Stage', type: 'select',
    options: [
      { value: 'new', label: 'New' },
      { value: 'contacted', label: 'Contacted' },
      { value: 'qualified', label: 'Qualified' },
      { value: 'applied', label: 'Applied' },
      { value: 'offered', label: 'Offered' },
      { value: 'enrolled', label: 'Enrolled' },
      { value: 'lost', label: 'Lost' },
    ]
  },
  { value: 'score', label: 'Lead Score', type: 'number' },
  { value: 'engagement_score', label: 'Engagement Score', type: 'number' },
  {
    value: 'source', label: 'Source', type: 'select',
    options: [
      { value: 'website', label: 'Website' },
      { value: 'walk_in', label: 'Walk In' },
      { value: 'referral', label: 'Referral' },
      { value: 'social_media', label: 'Social Media' },
      { value: 'newspaper', label: 'Newspaper' },
      { value: 'event', label: 'Event' },
      { value: 'other', label: 'Other' },
    ]
  },
  { value: 'interested_programs', label: 'Interested Programs', type: 'text' },
  { value: 'last_contacted_at', label: 'Last Contacted', type: 'date' },
  { value: 'created_at', label: 'Created At', type: 'date' },
  { value: 'wa_opt_in', label: 'WhatsApp Opted In', type: 'boolean' },
  { value: 'tags', label: 'Tags', type: 'text' },
  { value: 'counselor_id', label: 'Counselor ID', type: 'text' },
];

type OperatorKey = SegmentCriterion['operator'];

const OPERATORS_BY_TYPE: Record<string, { value: OperatorKey; label: string }[]> = {
  text: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' },
    { value: 'is_null', label: 'Is Empty' },
    { value: 'is_not_null', label: 'Is Not Empty' },
  ],
  number: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'greater_than', label: 'Greater Than' },
    { value: 'less_than', label: 'Less Than' },
  ],
  boolean: [
    { value: 'equals', label: 'Equals' },
  ],
  select: [
    { value: 'equals', label: 'Equals' },
    { value: 'not_equals', label: 'Not Equals' },
    { value: 'in', label: 'In' },
    { value: 'not_in', label: 'Not In' },
  ],
  date: [
    { value: 'older_than_days', label: 'Older Than (days)' },
    { value: 'newer_than_days', label: 'Newer Than (days)' },
    { value: 'is_null', label: 'Is Empty' },
    { value: 'is_not_null', label: 'Is Not Empty' },
  ],
};

// =============================================================================
// SEGMENT BUILDER ROW COMPONENT
// =============================================================================

interface CriterionRowProps {
  criterion: SegmentCriterion;
  index: number;
  onChange: (index: number, criterion: SegmentCriterion) => void;
  onRemove: (index: number) => void;
}

function CriterionRow({ criterion, index, onChange, onRemove }: CriterionRowProps) {
  const fieldDef = SEGMENT_FIELDS.find((f) => f.value === criterion.field);
  const fieldType = fieldDef?.type || 'text';
  const operators = OPERATORS_BY_TYPE[fieldType] || OPERATORS_BY_TYPE.text;
  const needsValue = !['is_null', 'is_not_null'].includes(criterion.operator);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Field selector */}
      <Select
        value={criterion.field}
        onValueChange={(val) => {
          const newFieldDef = SEGMENT_FIELDS.find((f) => f.value === val);
          const newType = newFieldDef?.type || 'text';
          const newOps = OPERATORS_BY_TYPE[newType] || OPERATORS_BY_TYPE.text;
          onChange(index, {
            field: val,
            operator: newOps[0].value,
            value: newType === 'boolean' ? true : '',
          });
        }}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          {SEGMENT_FIELDS.map((f) => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Operator selector */}
      <Select
        value={criterion.operator}
        onValueChange={(val) =>
          onChange(index, { ...criterion, operator: val as OperatorKey })
        }
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {operators.map((op) => (
            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Value input */}
      {needsValue && fieldType === 'boolean' && (
        <Select
          value={String(criterion.value)}
          onValueChange={(val) =>
            onChange(index, { ...criterion, value: val === 'true' })
          }
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Yes</SelectItem>
            <SelectItem value="false">No</SelectItem>
          </SelectContent>
        </Select>
      )}

      {needsValue && fieldType === 'select' && fieldDef?.options && (
        <Select
          value={String(criterion.value)}
          onValueChange={(val) => onChange(index, { ...criterion, value: val })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            {fieldDef.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {needsValue && (fieldType === 'text' || fieldType === 'number' || fieldType === 'date') && (
        <Input
          type={fieldType === 'number' || fieldType === 'date' ? 'number' : 'text'}
          placeholder={fieldType === 'date' ? 'Number of days' : 'Value'}
          value={String(criterion.value || '')}
          onChange={(e) =>
            onChange(index, {
              ...criterion,
              value: fieldType === 'number' || fieldType === 'date'
                ? Number(e.target.value)
                : e.target.value,
            })
          }
          className="w-[180px]"
        />
      )}

      {/* Remove button */}
      <Button variant="ghost" size="icon" onClick={() => onRemove(index)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// =============================================================================
// SEGMENT BUILDER DIALOG
// =============================================================================

interface SegmentBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  editingSegment?: { id: string; name: string; description: string | null; criteria: SegmentCriterion[]; logic: 'AND' | 'OR' } | null;
}

function SegmentBuilderDialog({ open, onOpenChange, institutionId, editingSegment }: SegmentBuilderProps) {
  const [name, setName] = useState(editingSegment?.name || '');
  const [description, setDescription] = useState(editingSegment?.description || '');
  const [logic, setLogic] = useState<'AND' | 'OR'>(editingSegment?.logic || 'AND');
  const [criteria, setCriteria] = useState<SegmentCriterion[]>(
    editingSegment?.criteria || [{ field: 'funnel_stage', operator: 'equals', value: 'new' }]
  );

  const { preview, previewAsync, data: previewData, isLoading: previewing, reset: resetPreview } = useWASegmentPreview();
  const { create, update } = useWASegmentMutations();

  const handleAddCondition = () => {
    setCriteria([...criteria, { field: 'full_name', operator: 'contains', value: '' }]);
  };

  const handleChangeCondition = (index: number, updated: SegmentCriterion) => {
    const next = [...criteria];
    next[index] = updated;
    setCriteria(next);
  };

  const handleRemoveCondition = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  const handlePreview = () => {
    if (criteria.length === 0) {
      toast.error('Add at least one condition');
      return;
    }
    preview({ institution_id: institutionId, criteria, logic });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Segment name is required');
      return;
    }
    if (criteria.length === 0) {
      toast.error('Add at least one condition');
      return;
    }

    try {
      if (editingSegment?.id) {
        await update.mutateAsync({
          id: editingSegment.id,
          name: name.trim(),
          description: description.trim() || undefined,
          criteria,
          logic,
        });
      } else {
        await create.mutateAsync({
          institution_id: institutionId,
          name: name.trim(),
          description: description.trim() || undefined,
          criteria,
          logic,
          created_by: '', // Will be overridden by API to use auth user
        });
      }
      onOpenChange(false);
      resetPreview();
    } catch {
      // Error handled by mutation
    }
  };

  const isSaving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            {editingSegment ? 'Edit Segment' : 'New Audience Segment'}
          </DialogTitle>
          <DialogDescription>
            Build a reusable audience segment for WhatsApp campaigns. Only opted-in leads are included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name + Description */}
          <div className="space-y-2">
            <Input
              placeholder="Segment name (e.g., B.Pharm Hot Leads)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Logic toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Match</span>
            <Button
              variant={logic === 'AND' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLogic('AND')}
            >
              ALL conditions (AND)
            </Button>
            <Button
              variant={logic === 'OR' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLogic('OR')}
            >
              ANY condition (OR)
            </Button>
          </div>

          {/* Condition rows */}
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <CriterionRow
                key={i}
                criterion={c}
                index={i}
                onChange={handleChangeCondition}
                onRemove={handleRemoveCondition}
              />
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={handleAddCondition}>
            <Plus className="h-4 w-4 mr-1" /> Add Condition
          </Button>

          {/* Auto wa_opt_in notice */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
            <Users className="h-3 w-3" />
            wa_opt_in = true is always applied automatically (compliance)
          </div>

          {/* Preview section */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Preview</span>
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={previewing}>
                {previewing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                Preview
              </Button>
            </div>

            {previewData && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-base px-3 py-1">
                    {previewData.count} leads match
                  </Badge>
                  <span className="text-xs text-green-600">(all opted-in)</span>
                </div>

                {previewData.sample.length > 0 && (
                  <div className="text-xs space-y-1">
                    <span className="text-muted-foreground">Sample leads:</span>
                    <div className="grid grid-cols-2 gap-1">
                      {previewData.sample.map((lead) => (
                        <div key={lead.id} className="flex items-center gap-1 text-xs bg-muted/50 rounded px-2 py-1">
                          <Users className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">{lead.full_name}</span>
                          <Badge variant="outline" className="text-[10px] ml-auto">{lead.funnel_stage}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
            {editingSegment ? 'Update Segment' : 'Save Segment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN PAGE CONTENT
// =============================================================================

function SegmentsPageContent() {
  const { selectedInstitutionId, loading: accessLoading } = useUserInstitutionAccess();
  const { segments, isLoading: segmentsLoading, refetch } = useWASegments(selectedInstitutionId);
  const { resolve } = useWASegmentMutations();

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<{
    id: string; name: string; description: string | null;
    criteria: SegmentCriterion[]; logic: 'AND' | 'OR';
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const { delete: deleteSegment } = useWASegmentMutations();

  const isLoading = accessLoading || segmentsLoading;

  const handleEdit = useCallback((seg: typeof segments[0]) => {
    setEditingSegment({
      id: seg.id,
      name: seg.name,
      description: seg.description,
      criteria: seg.criteria as SegmentCriterion[],
      logic: seg.logic as 'AND' | 'OR',
    });
    setIsBuilderOpen(true);
  }, []);

  const handleNewSegment = useCallback(() => {
    setEditingSegment(null);
    setIsBuilderOpen(true);
  }, []);

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteSegment.mutateAsync(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleResolve = async (segmentId: string) => {
    setResolvingId(segmentId);
    try {
      const result = await resolve.mutateAsync(segmentId);
      toast.success(`Resolved: ${result.total} leads ready for campaign`);
    } catch {
      // Error handled by mutation
    } finally {
      setResolvingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Audience Segments</h2>
          <p className="text-muted-foreground">
            Build reusable audience segments for WhatsApp campaigns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button onClick={handleNewSegment}>
            <Plus className="h-4 w-4 mr-1" /> New Segment
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Segments</CardDescription>
            <CardTitle className="text-3xl">{segments.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Segments</CardDescription>
            <CardTitle className="text-3xl">{segments.filter((s) => s.is_active).length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Cached Leads</CardDescription>
            <CardTitle className="text-3xl">
              {segments.reduce((sum, s) => sum + (s.cached_count || 0), 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Saved Segments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Saved Segments</CardTitle>
          <CardDescription>Click Use to resolve a segment for campaign targeting</CardDescription>
        </CardHeader>
        <CardContent>
          {segments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Filter className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">No segments yet</p>
              <p className="text-sm">Create your first audience segment to target WhatsApp campaigns.</p>
              <Button className="mt-4" onClick={handleNewSegment}>
                <Plus className="h-4 w-4 mr-1" /> Create Segment
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Conditions</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map((seg) => (
                  <TableRow key={seg.id}>
                    <TableCell className="font-medium">{seg.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">
                          {(seg.criteria as SegmentCriterion[]).length} rules
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {seg.logic}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {seg.cached_count !== null ? seg.cached_count.toLocaleString() : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {seg.last_used_at
                        ? formatDistanceToNow(new Date(seg.last_used_at), { addSuffix: true })
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(seg.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={seg.is_active ? 'default' : 'secondary'}>
                        {seg.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleResolve(seg.id)}
                          disabled={resolvingId === seg.id}
                        >
                          {resolvingId === seg.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Zap className="h-3 w-3" />}
                          <span className="ml-1">Use</span>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(seg)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteConfirmId(seg.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Segment Builder Dialog */}
      {isBuilderOpen && selectedInstitutionId && (
        <SegmentBuilderDialog
          open={isBuilderOpen}
          onOpenChange={(open) => {
            setIsBuilderOpen(open);
            if (!open) setEditingSegment(null);
          }}
          institutionId={selectedInstitutionId}
          editingSegment={editingSegment}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Segment</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this audience segment. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =============================================================================
// PAGE EXPORT
// =============================================================================

export default function AudienceSegmentsPage() {
  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Audience Segments">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/marketing/campaigns">Campaigns</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Audience Segments</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <AdmissionErrorBoundary>
          <SegmentsPageContent />
        </AdmissionErrorBoundary>
      </ContentLayout>
    </PermissionGuard>
  );
}
