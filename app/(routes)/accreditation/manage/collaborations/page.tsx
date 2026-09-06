// app/(routes)/accreditation/manage/collaborations/page.tsx
// ============================================================================
// MoU / Grants register (C6) — CRUD UI for institution_collaborations.
// Every saved record (status other than Draft) auto-emits accreditation
// evidence via DB trigger: MoUs / industry collaborations → NAAC 7.9,
// grants → NAAC 9.1 (quality_evidence_mappings). Serves CAC Metric 5.
// Modeled on manage/grievance-categories (same manage-area CRUD pattern).
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
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
  CollaborationService,
  COLLABORATION_KIND_LABELS,
  COLLABORATION_STATUS_LABELS,
  type CollaborationRow,
  type CollaborationInput,
  type CollaborationKind,
  type CollaborationScope,
  type CollaborationStatus,
} from '@/lib/services/accreditation/collaboration-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

const KINDS = Object.keys(COLLABORATION_KIND_LABELS) as CollaborationKind[];
const STATUSES = Object.keys(COLLABORATION_STATUS_LABELS) as CollaborationStatus[];

function CollaborationFormDialog({
  open, onOpenChange, mode, entity, institutionId, jkknColleges,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'create' | 'edit';
  entity?: CollaborationRow;
  institutionId: string;
  /** The JKKN colleges offerable as the other signatory. Never includes the
   *  filing college — a college cannot sign an agreement with itself. */
  jkknColleges: IqacInstitution[];
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<CollaborationKind>(entity?.kind ?? 'mou');
  const [title, setTitle] = useState(entity?.title ?? '');
  const [partnerName, setPartnerName] = useState(entity?.partner_name ?? '');
  // 'none' is an external partner — an outside university, funder or company,
  // which has no row in `institutions` and is named in free text exactly as
  // before. Picking a college is purely additive to that path.
  const [partnerInstId, setPartnerInstId] = useState<string>(
    entity?.partner_institution_id ?? 'none'
  );
  const [scope, setScope] = useState<'none' | CollaborationScope>(entity?.scope ?? 'none');
  const [signedOn, setSignedOn] = useState(entity?.signed_on ?? '');
  const [validTill, setValidTill] = useState(entity?.valid_till ?? '');
  const [amountInr, setAmountInr] = useState<string>(
    entity?.amount_inr != null ? String(entity.amount_inr) : ''
  );
  const [status, setStatus] = useState<CollaborationStatus>(entity?.status ?? 'active');
  const [documentUrl, setDocumentUrl] = useState(entity?.document_url ?? '');
  const [notes, setNotes] = useState(entity?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);

  const partnerOptions = useMemo(
    () => jkknColleges.filter((c) => c.id !== institutionId),
    [jkknColleges, institutionId]
  );

  // The name follows the college, so `partner_name` never disagrees with
  // `partner_institution_id`. The free-text box is locked while a college is
  // chosen for the same reason — two fields naming two different partners is a
  // record that lies about who signed.
  const handlePartnerCollegeChange = (value: string) => {
    setPartnerInstId(value);
    const picked = partnerOptions.find((c) => c.id === value);
    if (picked) setPartnerName(picked.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) { toast.error('Title must be at least 3 characters.'); return; }
    if (partnerName.trim().length < 2) { toast.error('Partner name must be at least 2 characters.'); return; }
    if (!signedOn) { toast.error('Signed-on date is required.'); return; }
    if (validTill && validTill < signedOn) { toast.error('Valid-till cannot be before signed-on.'); return; }
    let amountNum: number | null = null;
    if (amountInr.trim() !== '') {
      amountNum = Number(amountInr);
      if (isNaN(amountNum) || amountNum < 0) { toast.error('Amount must be a non-negative number.'); return; }
    }

    const payload: CollaborationInput = {
      kind,
      institution_id: institutionId,
      title: title.trim(),
      partner_name: partnerName.trim(),
      partner_institution_id: partnerInstId === 'none' ? null : partnerInstId,
      scope: scope === 'none' ? null : scope,
      signed_on: signedOn,
      valid_till: validTill || null,
      amount_inr: amountNum,
      status,
      document_url: documentUrl.trim() || null,
      notes: notes.trim() || null,
    };

    setSubmitting(true);
    try {
      if (mode === 'edit' && entity) {
        await CollaborationService.update(entity.id, payload);
        toast.success('Record updated — evidence refreshed.');
      } else {
        await CollaborationService.create(payload);
        toast.success(
          status === 'draft'
            ? 'Draft saved (no evidence emitted until it leaves Draft).'
            : 'Record created — accreditation evidence emitted.'
        );
      }
      qc.invalidateQueries({ queryKey: ['institution-collaborations', institutionId] });
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
          <DialogTitle>
            {mode === 'edit' ? 'Edit record' : 'New MoU / grant record'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Type *</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as CollaborationKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map(k => (
                    <SelectItem key={k} value={k}>{COLLABORATION_KIND_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {kind === 'grant' ? 'Emits NAAC 9.1 evidence.' : 'Emits NAAC 7.9 evidence.'}
              </p>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as CollaborationStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{COLLABORATION_STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={300}
              placeholder="e.g. MoU with XYZ Industries for internships & research" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label>A JKKN college</Label>
              <Select value={partnerInstId} onValueChange={handlePartnerCollegeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not a JKKN college</SelectItem>
                  {partnerOptions.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.iqac_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {partnerInstId === 'none'
                  ? 'Optional. Leave this for an outside university, funder or company.'
                  : 'Both colleges will see this record and can maintain it.'}
              </p>
            </div>
            <div>
              <Label>Partner / funder *</Label>
              <Input
                value={partnerName}
                onChange={e => setPartnerName(e.target.value)}
                maxLength={200}
                disabled={partnerInstId !== 'none'}
              />
            </div>
            <div>
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as 'none' | CollaborationScope)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not specified</SelectItem>
                  <SelectItem value="national">National</SelectItem>
                  <SelectItem value="international">International</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <Label>Signed on *</Label>
              <Input type="date" value={signedOn} onChange={e => setSignedOn(e.target.value)} />
            </div>
            <div>
              <Label>Valid till</Label>
              <Input type="date" value={validTill ?? ''} onChange={e => setValidTill(e.target.value)} />
            </div>
            <div>
              <Label>Amount (INR)</Label>
              <Input type="number" min={0} value={amountInr}
                onChange={e => setAmountInr(e.target.value)} placeholder="Grants only" />
            </div>
          </div>
          <div>
            <Label>Document URL</Label>
            <Input value={documentUrl} onChange={e => setDocumentUrl(e.target.value)}
              placeholder="Link to the signed MoU / sanction letter" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
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
 * navMeta — chip under Accreditation → Manage (nav-config.ts). Nav-coverage
 * detector (`scripts/assert-nav-coverage.mjs`) reads this to pass
 * discoverability.
 */
export const navMeta = {
  invokedFrom: '/accreditation',
} as const;

// Institution row shape for the super-admin picker — same iqac-coded filter
// as manage/grievance-categories (the 8 colleges with an accreditation
// footprint; admin/shared/testing institutions excluded).
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

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export default function CollaborationsRegisterPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, canAccess } = usePermissions();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const canManage = isSuperAdmin || canAccess('accreditation.collaborations', 'manage');

  // Needed by TWO pickers now: the super admin's "which institution am I
  // filing for", and the form's optional "the other signatory is a JKKN
  // college". The second is available to anyone who can file a record, so the
  // read can no longer be limited to super admins.
  const { data: pickableInstitutions = [] } = useQuery({
    queryKey: ['institution-collaborations', 'iqac-institutions'],
    queryFn: fetchIqacInstitutions,
    enabled: canManage,
  });

  const [pickedInstId, setPickedInstId] = useState<string>('');

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
    queryKey: ['institution-collaborations', effectiveInstitutionId],
    queryFn: () => CollaborationService.list(effectiveInstitutionId),
    enabled: !!effectiveInstitutionId,
  });

  const columns: ColumnDef<CollaborationRow>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span>{row.original.title}</span>
          <Badge variant="outline" className="text-[10px]">
            {COLLABORATION_KIND_LABELS[row.original.kind]}
          </Badge>
          {row.original.scope === 'international' && (
            <Badge className="text-[10px]">international</Badge>
          )}
          {/* One agreement, one record, both signatories — so a row filed by
              the OTHER college appears here too, and has to say so. Without
              this it reads as a record of this college's own that names this
              college as its partner. */}
          {row.original.institution_id !== effectiveInstitutionId && (
            <Badge variant="secondary" className="text-[10px]">
              filed by the partner college
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'partner_name',
      header: 'Partner / funder',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span>{row.original.partner_name}</span>
          {row.original.partner_institution_id && (
            <Badge variant="outline" className="text-[10px]">
              JKKN college
            </Badge>
          )}
        </div>
      ),
    },
    { accessorKey: 'signed_on', header: 'Signed on' },
    { accessorKey: 'valid_till', header: 'Valid till' },
    {
      accessorKey: 'amount_inr',
      header: 'Amount (INR)',
      cell: ({ row }) =>
        row.original.amount_inr != null ? `₹${inr.format(row.original.amount_inr)}` : '—',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.status === 'active'
          ? <Badge>active</Badge>
          : <Badge variant="outline">{COLLABORATION_STATUS_LABELS[row.original.status]}</Badge>,
    },
    {
      id: 'evidence',
      header: 'Evidence',
      cell: ({ row }) =>
        row.original.status === 'draft'
          ? <span className="text-xs text-muted-foreground">none (draft)</span>
          : <Badge variant="secondary" className="text-[10px]">
              NAAC {row.original.kind === 'grant' ? '9.1' : '7.9'}
            </Badge>,
    },
    ...(canManage
      ? [{
          id: 'actions',
          cell: ({ row }: { row: { original: CollaborationRow } }) => (
            <CrudRowActions<CollaborationRow>
              entity={row.original}
              entityLabel="record"
              entityDisplayName={(e) => e.title}
              // Editing a shared record is open to both signatories; deleting
              // the other college's record is not (ic_delete was deliberately
              // not widened). Hidden rather than offered-and-refused.
              canDelete={(e) => canManage && e.institution_id === effectiveInstitutionId}
              onDelete={async (id) => {
                await CollaborationService.delete(id);
                qc.invalidateQueries({ queryKey: ['institution-collaborations', effectiveInstitutionId] });
              }}
              EditDialog={({ open, onOpenChange, entity }) => (
                <CollaborationFormDialog
                  open={open}
                  onOpenChange={onOpenChange}
                  mode="edit"
                  entity={entity}
                  institutionId={effectiveInstitutionId}
                  jkknColleges={pickableInstitutions}
                />
              )}
            />
          ),
        } as ColumnDef<CollaborationRow>]
      : []),
  ];

  return (
    <PermissionGuard module="accreditation.collaborations" action="view">
      <ContentLayout title="MoU & Grants Register">
        <PageBreadcrumb
          items={[
            { label: 'Accreditation', href: '/accreditation' },
            { label: 'Manage' },
            { label: 'MoUs & Grants' },
          ]}
        />
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">MoU & Grants Register</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Register of MoUs, external grants and industry collaborations
                  this institution is a party to — the ones it filed, and the
                  ones another JKKN college filed naming it as the partner.
                  Saved records automatically become accreditation evidence —
                  MoUs and industry collaborations feed NAAC 7.9, grants feed
                  NAAC 9.1. Drafts stay out of evidence until activated.
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
                {canManage && (
                  <Button
                    onClick={() => setShowCreate(true)}
                    disabled={!effectiveInstitutionId}
                  >
                    <Plus className="mr-2 h-4 w-4" /> New Record
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CrudDataTable<CollaborationRow>
              items={items}
              loading={isLoading}
              error={error ? (error as Error).message : null}
              onRefresh={() => { void refetch(); }}
              onBulkDelete={(ids) => CollaborationService.bulkDelete(ids)}
              columns={columns}
              entityLabel="record"
              entityLabelPlural="records"
            />
          </CardContent>
        </Card>

        <CollaborationFormDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          mode="create"
          institutionId={effectiveInstitutionId}
          jkknColleges={pickableInstitutions}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}
