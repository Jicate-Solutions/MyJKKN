// app/(routes)/accreditation/manage/grievance-categories/page.tsx
// ============================================================================
// CRUD UI for grievance_categories — closes the A6a gap where categories were
// seeded-only. Principal / IQAC admin can add local categories + edit labels
// + deactivate. System-default categories (is_system=true) are protected from
// delete by CrudRowActions' default rule (canDelete=!is_system).
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { CrudDataTable } from '@/components/shared/crud-master/crud-data-table';
import { CrudRowActions } from '@/components/shared/crud-master/crud-row-actions';
import {
  GrievanceCategoryService,
  type GrievanceCategoryRow,
  type GrievanceCategoryInput,
} from '@/lib/services/grievance/grievance-category-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

const ASSIGNEE_ROLES = ['admin', 'principal', 'hod', 'staff'] as const;

function CategoryFormDialog({
  open, onOpenChange, mode, entity, institutionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'create' | 'edit';
  entity?: GrievanceCategoryRow;
  institutionId: string;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(entity?.name ?? '');
  const [description, setDescription] = useState(entity?.description ?? '');
  const [slaHours, setSlaHours] = useState<string>(String(entity?.default_sla_hours ?? 72));
  const [assigneeRole, setAssigneeRole] = useState(entity?.default_assignee_role ?? 'admin');
  const [metricCode, setMetricCode] = useState(entity?.default_naac_metric_code ?? '7.7.1');
  const [isEmergency, setIsEmergency] = useState(entity?.is_emergency ?? false);
  const [attachmentRequired, setAttachmentRequired] = useState(entity?.attachment_required ?? false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { toast.error('Name must be at least 2 characters.'); return; }
    const slaNum = parseInt(slaHours, 10);
    if (isNaN(slaNum) || slaNum < 1 || slaNum > 10000) {
      toast.error('SLA hours must be between 1 and 10000.');
      return;
    }

    const payload: GrievanceCategoryInput = {
      institution_id: institutionId,
      name: name.trim(),
      description: description.trim() || null,
      default_sla_hours: slaNum,
      default_assignee_role: assigneeRole,
      default_naac_metric_code: metricCode.trim() || null,
      is_emergency: isEmergency,
      attachment_required: attachmentRequired,
    };

    setSubmitting(true);
    try {
      if (mode === 'edit' && entity) {
        await GrievanceCategoryService.update(entity.id, payload);
        toast.success('Category updated.');
      } else {
        await GrievanceCategoryService.create(payload);
        toast.success('Category created.');
      }
      qc.invalidateQueries({ queryKey: ['grievance-categories', institutionId] });
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit category' : 'New grievance category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} maxLength={120} />
            {entity?.is_system && (
              <p className="text-xs text-amber-600 mt-1">
                System category — name changes are allowed but deletion is blocked.
              </p>
            )}
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label>Default SLA (hours)</Label>
              <Input type="number" value={slaHours} onChange={e => setSlaHours(e.target.value)} min={1} max={10000} />
            </div>
            <div>
              <Label>Default assignee</Label>
              <Select value={assigneeRole} onValueChange={setAssigneeRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNEE_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>NAAC metric code</Label>
              <Input value={metricCode} onChange={e => setMetricCode(e.target.value)} placeholder="7.7.1" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isEmergency} onChange={e => setIsEmergency(e.target.checked)} />
              Emergency category (e.g. ICC / Ragging)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={attachmentRequired} onChange={e => setAttachmentRequired(e.target.checked)} />
              Attachment required
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * navMeta — invoked from the Accreditation Hub (admin/manage area) via a
 * "Manage Grievance Categories" admin CTA. Nav-coverage detector
 * (`scripts/assert-nav-coverage.mjs`) reads this to pass discoverability.
 */
export const navMeta = {
  invokedFrom: '/accreditation',
} as const;

// Institution row shape for the super-admin picker — only iqac-coded, active
// JKKN colleges are pickable (the 8 institutions that have seeded categories).
// Admin / shared / testing institutions are excluded because they have no
// accreditation footprint.
interface IqacInstitution {
  id: string;
  name: string;
  iqac_code: string;
}

async function fetchIqacInstitutions(): Promise<IqacInstitution[]> {
  const supabase = createClientSupabaseClient();
  const { data, error } = await (supabase as any)
    .from('institutions')
    .select('id, name, iqac_code')
    .not('iqac_code', 'is', null)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as IqacInstitution[];
}

export default function GrievanceCategoriesPage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  // Super-admin institution picker. Non-super users always see their own
  // institution's categories (profile.institution_id). Super admins see a
  // dropdown of the 8 iqac-coded colleges and can switch between them, since
  // their profile's institution_id (Main Office / Testing) has no seeded
  // categories and would otherwise show an empty state.
  const { data: pickableInstitutions = [] } = useQuery({
    queryKey: ['grievance-categories', 'iqac-institutions'],
    queryFn: fetchIqacInstitutions,
    enabled: isSuperAdmin,
  });

  const [pickedInstId, setPickedInstId] = useState<string>('');

  // Default super-admin's selection to the first iqac-coded institution once
  // the list loads. Runs once per mount (pickableInstitutions stable by id).
  useEffect(() => {
    if (isSuperAdmin && !pickedInstId && pickableInstitutions.length > 0) {
      setPickedInstId(pickableInstitutions[0].id);
    }
  }, [isSuperAdmin, pickedInstId, pickableInstitutions]);

  const effectiveInstitutionId = useMemo(
    () => (isSuperAdmin ? pickedInstId : profile?.institution_id ?? ''),
    [isSuperAdmin, pickedInstId, profile?.institution_id]
  );

  const { data: items = [], isLoading, error, refetch } = useQuery({
    queryKey: ['grievance-categories', effectiveInstitutionId],
    queryFn: () => GrievanceCategoryService.list(effectiveInstitutionId),
    enabled: !!effectiveInstitutionId,
  });

  const columns: ColumnDef<GrievanceCategoryRow>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span>{row.original.name}</span>
          {row.original.is_system && <Badge variant="outline" className="text-[10px]">system</Badge>}
          {row.original.is_emergency && <Badge variant="destructive" className="text-[10px]">emergency</Badge>}
        </div>
      ),
    },
    { accessorKey: 'default_sla_hours', header: 'SLA (h)' },
    { accessorKey: 'default_assignee_role', header: 'Assignee' },
    { accessorKey: 'default_naac_metric_code', header: 'NAAC metric' },
    {
      accessorKey: 'is_active',
      header: 'Active',
      cell: ({ row }) => (row.original.is_active ? <Badge>active</Badge> : <Badge variant="outline">inactive</Badge>),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <CrudRowActions<GrievanceCategoryRow>
          entity={row.original}
          entityLabel="category"
          entityDisplayName={(e) => e.name}
          onDelete={async (id) => {
            await GrievanceCategoryService.delete(id);
            qc.invalidateQueries({ queryKey: ['grievance-categories', effectiveInstitutionId] });
          }}
          EditDialog={({ open, onOpenChange, entity }) => (
            <CategoryFormDialog
              open={open}
              onOpenChange={onOpenChange}
              mode="edit"
              entity={entity}
              institutionId={effectiveInstitutionId}
            />
          )}
        />
      ),
    },
  ];

  return (
    <PermissionGuard module="grievance.categories" action="manage">
      <ContentLayout title="Grievance Categories">
        <PageBreadcrumb
          items={[
            { label: 'Accreditation', href: '/accreditation' },
            { label: 'Manage' },
            { label: 'Grievance Categories' },
          ]}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Grievance Categories</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Institution-scoped list. System defaults (SH/Ragging/Academic/Infrastructure/Other)
                  are protected from deletion but can be relabeled or reconfigured.
                </p>
              </div>
              <div className="flex items-end gap-2">
                {isSuperAdmin && (
                  <div className="w-64">
                    <Label className="text-xs">Institution</Label>
                    <Select
                      value={pickedInstId}
                      onValueChange={setPickedInstId}
                      disabled={pickableInstitutions.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick an institution…" />
                      </SelectTrigger>
                      <SelectContent>
                        {pickableInstitutions.map((inst) => (
                          <SelectItem key={inst.id} value={inst.id}>
                            {inst.name} ({inst.iqac_code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button variant="outline" asChild>
                  <Link href="/accreditation/naac/grievance">View Tickets</Link>
                </Button>
                <Button
                  onClick={() => setShowCreate(true)}
                  disabled={!effectiveInstitutionId}
                >
                  <Plus className="mr-2 h-4 w-4" /> New Category
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CrudDataTable<GrievanceCategoryRow>
              items={items}
              loading={isLoading}
              error={error ? (error as Error).message : null}
              onRefresh={() => refetch()}
              onBulkDelete={(ids) => GrievanceCategoryService.bulkDelete(ids)}
              columns={columns}
              entityLabel="category"
              entityLabelPlural="categories"
            />
          </CardContent>
        </Card>

        <CategoryFormDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          mode="create"
          institutionId={effectiveInstitutionId}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
