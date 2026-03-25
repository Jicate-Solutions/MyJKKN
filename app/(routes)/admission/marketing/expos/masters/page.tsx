'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Edit, Trash2, Loader2, Search, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  useExpoMasters,
  useCreateExpoMaster,
  useUpdateExpoMaster,
  useDeleteExpoMaster,
} from '@/hooks/admission/use-expos';
import type { ExpoMaster, ExpoFrequency } from '@/types/admission';

// =============================================================================
// CONSTANTS
// =============================================================================

const FREQUENCY_OPTIONS: { value: ExpoFrequency; label: string }[] = [
  { value: 'annual', label: 'Annual' },
  { value: 'biannual', label: 'Biannual' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'one_time', label: 'One Time' },
];

// =============================================================================
// FORM STATE
// =============================================================================

interface MasterFormState {
  event_name: string;
  organizer_name: string;
  city: string;
  venue_name: string;
  description: string;
  frequency: ExpoFrequency | '';
  tags: string;
}

const EMPTY_FORM: MasterFormState = {
  event_name: '',
  organizer_name: '',
  city: '',
  venue_name: '',
  description: '',
  frequency: '',
  tags: '',
};

function masterToForm(master: ExpoMaster): MasterFormState {
  return {
    event_name: master.event_name,
    organizer_name: master.organizer_name ?? '',
    city: master.city ?? '',
    venue_name: master.venue_name ?? '',
    description: master.description ?? '',
    frequency: master.frequency ?? '',
    tags: master.tags ? master.tags.join(', ') : '',
  };
}

// =============================================================================
// CREATE / EDIT DIALOG
// =============================================================================

interface MasterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingMaster: ExpoMaster | null;
  institutionId: string | null;
}

function MasterDialog({ open, onOpenChange, editingMaster, institutionId }: MasterDialogProps) {
  const [form, setForm] = useState<MasterFormState>(
    editingMaster ? masterToForm(editingMaster) : EMPTY_FORM
  );
  const [nameError, setNameError] = useState('');

  const createMaster = useCreateExpoMaster();
  const updateMaster = useUpdateExpoMaster();
  const isPending = createMaster.isPending || updateMaster.isPending;

  // Sync form when dialog opens with a different master
  const currentMasterId = editingMaster?.id ?? null;
  const [lastMasterId, setLastMasterId] = useState<string | null>(currentMasterId);
  if (currentMasterId !== lastMasterId) {
    setLastMasterId(currentMasterId);
    setForm(editingMaster ? masterToForm(editingMaster) : EMPTY_FORM);
    setNameError('');
  }

  function set(field: keyof MasterFormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (field === 'event_name') setNameError('');
    };
  }

  async function handleSave() {
    if (!form.event_name.trim()) {
      setNameError('Event name is required.');
      return;
    }

    const tagsArray = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      event_name: form.event_name.trim(),
      organizer_name: form.organizer_name.trim() || undefined,
      city: form.city.trim() || undefined,
      venue_name: form.venue_name.trim() || undefined,
      description: form.description.trim() || undefined,
      frequency: (form.frequency as ExpoFrequency) || undefined,
      tags: tagsArray.length > 0 ? tagsArray : undefined,
    };

    try {
      if (editingMaster) {
        await updateMaster.mutateAsync({ id: editingMaster.id, ...payload });
      } else {
        await createMaster.mutateAsync({ institution_id: institutionId, ...payload });
      }
      onOpenChange(false);
    } catch {
      // Toast already shown by the mutation hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{editingMaster ? 'Edit Expo Master' : 'Add Expo Master'}</DialogTitle>
          <DialogDescription>
            {editingMaster
              ? 'Update the details for this reusable expo catalog entry.'
              : 'Add a new event to the expo masters catalog for reuse across event instances.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
          {/* Event Name */}
          <div className="space-y-1.5">
            <Label htmlFor="em-event-name">
              Event Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="em-event-name"
              placeholder="e.g. JKKN Education Fair"
              value={form.event_name}
              onChange={set('event_name')}
            />
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </div>

          {/* Organizer */}
          <div className="space-y-1.5">
            <Label htmlFor="em-organizer">Organizer Name</Label>
            <Input
              id="em-organizer"
              placeholder="e.g. State Education Council"
              value={form.organizer_name}
              onChange={set('organizer_name')}
            />
          </div>

          {/* City + Venue */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="em-city">City</Label>
              <Input
                id="em-city"
                placeholder="e.g. Chennai"
                value={form.city}
                onChange={set('city')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-venue">Venue Name</Label>
              <Input
                id="em-venue"
                placeholder="e.g. Trade Centre"
                value={form.venue_name}
                onChange={set('venue_name')}
              />
            </div>
          </div>

          {/* Frequency */}
          <div className="space-y-1.5">
            <Label>Frequency</Label>
            <Select
              value={form.frequency}
              onValueChange={(val) =>
                setForm((prev) => ({ ...prev, frequency: val as ExpoFrequency }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select frequency" />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="em-description">Description</Label>
            <Textarea
              id="em-description"
              placeholder="Brief description of the expo event..."
              value={form.description}
              onChange={set('description')}
              rows={3}
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label htmlFor="em-tags">Tags</Label>
            <Input
              id="em-tags"
              placeholder="Comma-separated tags, e.g. pharmacy, nursing, annual"
              value={form.tags}
              onChange={set('tags')}
            />
            <p className="text-xs text-muted-foreground">Separate multiple tags with commas.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editingMaster ? 'Save Changes' : 'Create Master'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// SKELETON ROWS
// =============================================================================

function TableSkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-28" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell><Skeleton className="h-6 w-10 rounded-full" /></TableCell>
          <TableCell><Skeleton className="h-8 w-20" /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

// =============================================================================
// PAGE CONTENT
// =============================================================================

function ExpoMastersPageContent() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id ?? null;

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaster, setEditingMaster] = useState<ExpoMaster | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const { data: masters, isLoading: mastersLoading } = useExpoMasters();

  const updateMaster = useUpdateExpoMaster();
  const deleteMaster = useDeleteExpoMaster();

  const isLoading = mastersLoading;

  const filteredMasters = useMemo(() => {
    if (!search.trim()) return masters;
    const q = search.toLowerCase();
    return masters.filter(
      (m) =>
        m.event_name.toLowerCase().includes(q) ||
        (m.organizer_name ?? '').toLowerCase().includes(q) ||
        (m.city ?? '').toLowerCase().includes(q)
    );
  }, [masters, search]);

  function handleAddNew() {
    setEditingMaster(null);
    setDialogOpen(true);
  }

  function handleEdit(master: ExpoMaster) {
    setEditingMaster(master);
    setDialogOpen(true);
  }

  function handleDialogClose(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditingMaster(null);
  }

  async function handleToggleActive(master: ExpoMaster) {
    try {
      await updateMaster.mutateAsync({ id: master.id, is_active: !master.is_active });
    } catch {
      // Toast already shown by mutation hook
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTargetId) return;
    try {
      await deleteMaster.mutateAsync(deleteTargetId);
      setDeleteTargetId(null);
    } catch {
      // Toast already shown by mutation hook
    }
  }

  const frequencyLabel = (freq: ExpoFrequency | null) => {
    if (!freq) return '—';
    return FREQUENCY_OPTIONS.find((o) => o.value === freq)?.label ?? freq;
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/marketing/campaigns/monitoring">Marketing</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/admission/marketing/expos">Expos</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Expo Masters</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Expo Masters</h2>
          <p className="text-muted-foreground text-sm">
            Reusable expo event catalog. Create master entries to quickly spin up event instances.
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add Expo Master
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, organizer, city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" />
            Catalog
            {!isLoading && (
              <Badge variant="secondary" className="ml-1">
                {filteredMasters.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event Name</TableHead>
                <TableHead>Organizer</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeletonRows />
              ) : filteredMasters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <BookOpen className="h-10 w-10 opacity-30" />
                      <p className="font-medium">
                        {search ? 'No results match your search' : 'No expo masters yet'}
                      </p>
                      {!search && (
                        <p className="text-sm">
                          Add your first expo master to build a reusable event catalog.
                        </p>
                      )}
                      {!search && (
                        <Button variant="outline" size="sm" className="mt-2" onClick={handleAddNew}>
                          <Plus className="h-4 w-4 mr-1" /> Add Expo Master
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredMasters.map((master) => (
                  <TableRow key={master.id}>
                    {/* Event Name */}
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span>{master.event_name}</span>
                        {master.tags && master.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {master.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                                {tag}
                              </Badge>
                            ))}
                            {master.tags.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">
                                +{master.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    {/* Organizer */}
                    <TableCell className="text-muted-foreground">
                      {master.organizer_name ?? '—'}
                    </TableCell>

                    {/* City */}
                    <TableCell className="text-muted-foreground">
                      {master.city ?? '—'}
                    </TableCell>

                    {/* Venue */}
                    <TableCell className="text-muted-foreground">
                      {master.venue_name ?? '—'}
                    </TableCell>

                    {/* Frequency */}
                    <TableCell>
                      {master.frequency ? (
                        <Badge variant="secondary">{frequencyLabel(master.frequency)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Active Toggle */}
                    <TableCell>
                      <Switch
                        checked={master.is_active}
                        onCheckedChange={() => handleToggleActive(master)}
                        disabled={updateMaster.isPending}
                        aria-label={`Toggle active for ${master.event_name}`}
                      />
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(master)}
                          aria-label="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTargetId(master.id)}
                          aria-label="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / Edit Dialog */}
      <MasterDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editingMaster={editingMaster}
        institutionId={institutionId}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTargetId} onOpenChange={() => setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expo Master</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this expo master from the catalog. Existing expo events
              linked to this master will not be affected. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMaster.isPending}
            >
              {deleteMaster.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
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

export default function ExpoMastersPage() {
  return (
    <PermissionGuard module="admission.marketing.expos" action="view">
      <ContentLayout title="Expo Masters">
        <AdmissionErrorBoundary>
          <ExpoMastersPageContent />
        </AdmissionErrorBoundary>
      </ContentLayout>
    </PermissionGuard>
  );
}
