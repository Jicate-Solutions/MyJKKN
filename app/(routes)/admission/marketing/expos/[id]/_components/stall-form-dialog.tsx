'use client';

// BUG-003146: Create / edit dialog for an expo event stall.
// Uses useCreateStall / useUpdateStall under the hood; parent controls open state.

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { StorageService } from '@/lib/storage/storage-service';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useFilteredStaffForDropdown } from '@/hooks/admission/use-referral-dropdowns';
import { useCreateStall, useUpdateStall } from '@/hooks/admission/use-stalls';
import { PromotionalMaterialsRepeater } from './promotional-materials-repeater';
import type {
  ExpoEventStall,
  PromotionalMaterial,
  CreateExpoStallInput,
  UpdateExpoStallInput,
} from '@/types/admission';

interface StallFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expoEventId: string;
  /** Default institution to pre-select when the event itself is institution-scoped. */
  defaultInstitutionId?: string;
  /** When set, dialog renders in edit mode. When null/undefined, create mode. */
  stall?: ExpoEventStall | null;
}

const MAX_PHOTOS = 10;

export function StallFormDialog({
  open,
  onOpenChange,
  expoEventId,
  defaultInstitutionId,
  stall,
}: StallFormDialogProps) {
  const isEdit = !!stall;

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const [stallName, setStallName] = useState('');
  const [institutionId, setInstitutionId] = useState<string>('');
  const [assignedStaffId, setAssignedStaffId] = useState<string>('');
  const [staffSearch, setStaffSearch] = useState('');
  const [totalExpenses, setTotalExpenses] = useState<string>('0');
  const [photos, setPhotos] = useState<string[]>([]);
  const [materials, setMaterials] = useState<PromotionalMaterial[]>([]);
  const [notes, setNotes] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createStall = useCreateStall();
  const updateStall = useUpdateStall();

  // Staff list is institution-scoped. Refetches when institutionId changes.
  const { data: staffList = [], isLoading: staffLoading } = useFilteredStaffForDropdown({
    institution_id: institutionId || undefined,
    search: staffSearch || undefined,
  });

  // Reset form whenever dialog opens (create) or stall prop changes (edit).
  useEffect(() => {
    if (!open) return;
    if (stall) {
      setStallName(stall.stall_name);
      setInstitutionId(stall.institution_id);
      setAssignedStaffId(stall.assigned_staff_id ?? '');
      setTotalExpenses(String(stall.total_expenses ?? 0));
      setPhotos(stall.photos ?? []);
      setMaterials(stall.promotional_materials ?? []);
      setNotes(stall.notes ?? '');
    } else {
      setStallName('');
      setInstitutionId(defaultInstitutionId ?? '');
      setAssignedStaffId('');
      setTotalExpenses('0');
      setPhotos([]);
      setMaterials([]);
      setNotes('');
    }
    setStaffSearch('');
  }, [open, stall, defaultInstitutionId]);

  const isPending = createStall.isPending || updateStall.isPending;

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (photos.length + files.length > MAX_PHOTOS) {
      toast.error(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
    if (!institutionId) {
      toast.error('Select an institution before uploading photos');
      return;
    }

    setIsUploading(true);
    // For new stalls we don't have an id yet — use a timestamp key so
    // uploads land in a predictable folder we can migrate later.
    const stallKey = stall?.id ?? `draft_${Date.now()}`;
    const newUrls: string[] = [];

    for (const file of files) {
      const { publicUrl, error } = await StorageService.uploadExpoStallPhoto(
        file,
        institutionId,
        expoEventId,
        stallKey
      );
      if (error) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      } else if (publicUrl) {
        newUrls.push(publicUrl);
      }
    }

    if (newUrls.length > 0) setPhotos((prev) => [...prev, ...newUrls]);
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handlePhotoRemove(url: string) {
    await StorageService.deleteExpoPhoto(url);
    setPhotos((prev) => prev.filter((p) => p !== url));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!stallName.trim()) {
      toast.error('Stall name is required');
      return;
    }
    if (!institutionId) {
      toast.error('Select an institution for this stall');
      return;
    }

    const expensesNum = Number(totalExpenses);
    if (!Number.isFinite(expensesNum) || expensesNum < 0) {
      toast.error('Total expenses must be a non-negative number');
      return;
    }

    const cleanedMaterials = materials
      .map((m) => ({
        name: m.name.trim(),
        quantity: Math.max(0, Math.floor(Number(m.quantity) || 0)),
        notes: m.notes?.trim() || undefined,
      }))
      .filter((m) => m.name.length > 0);

    if (isEdit && stall) {
      const patch: UpdateExpoStallInput = {
        stall_name: stallName.trim(),
        institution_id: institutionId,
        assigned_staff_id: assignedStaffId || null,
        total_expenses: expensesNum,
        photos,
        promotional_materials: cleanedMaterials,
        notes: notes.trim() || null,
      };
      updateStall.mutate(
        { id: stall.id, ...patch },
        { onSuccess: () => onOpenChange(false) }
      );
    } else {
      const payload: CreateExpoStallInput = {
        expo_event_id: expoEventId,
        institution_id: institutionId,
        stall_name: stallName.trim(),
        assigned_staff_id: assignedStaffId || null,
        total_expenses: expensesNum,
        photos,
        promotional_materials: cleanedMaterials,
        notes: notes.trim() || null,
      };
      createStall.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Stall' : 'Add Stall'}</DialogTitle>
          <DialogDescription>
            Each stall is a staff-accountable sub-unit of the expo event with its own
            expenses, photos and promotional materials.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          {/* Stall name */}
          <div className="space-y-2">
            <Label htmlFor="stall-name">
              Stall Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="stall-name"
              value={stallName}
              onChange={(e) => setStallName(e.target.value)}
              placeholder="e.g. Engineering Stall, Nursing Stall"
              disabled={isPending}
              autoFocus
            />
          </div>

          {/* Institution */}
          <div className="space-y-2">
            <Label>
              Institution <span className="text-destructive">*</span>
            </Label>
            <Select
              value={institutionId}
              onValueChange={(v) => {
                setInstitutionId(v);
                // Reset staff selection when institution changes
                setAssignedStaffId('');
                setStaffSearch('');
              }}
              disabled={institutionsLoading || isPending}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={institutionsLoading ? 'Loading…' : 'Select institution'}
                />
              </SelectTrigger>
              <SelectContent>
                {institutions.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assigned staff (optional, institution-scoped) */}
          <div className="space-y-2">
            <Label>Assigned Staff</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                placeholder="Search staff by name…"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                disabled={!institutionId || isPending}
              />
              <Select
                value={assignedStaffId || '_unassigned'}
                onValueChange={(v) =>
                  setAssignedStaffId(v === '_unassigned' ? '' : v)
                }
                disabled={!institutionId || staffLoading || isPending}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !institutionId
                        ? 'Pick institution first'
                        : staffLoading
                          ? 'Loading staff…'
                          : staffList.length === 0
                            ? 'No staff found'
                            : 'Select staff'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_unassigned">— Unassigned —</SelectItem>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Staff are filtered by the stall&apos;s institution. Leave unassigned
              until you know who&apos;s running the stall.
            </p>
          </div>

          {/* Total expenses */}
          <div className="space-y-2">
            <Label htmlFor="total-expenses">Total Expenses (₹)</Label>
            <Input
              id="total-expenses"
              type="number"
              min={0}
              step="0.01"
              value={totalExpenses}
              onChange={(e) => setTotalExpenses(e.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground">
              Stall-specific expenses (rental, branding, transport to booth, etc.).
              Daily reports are tracked separately.
            </p>
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Photos</Label>
              <span className="text-xs text-muted-foreground">
                {photos.length}/{MAX_PHOTOS}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {photos.map((url) => (
                <div key={url} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Stall photo"
                    className="h-20 w-20 object-cover rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={() => handlePhotoRemove(url)}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !institutionId || isPending}
                  className="h-20 w-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Upload className="h-5 w-5 mb-1" />
                      <span className="text-[10px]">Upload</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {!institutionId && (
              <p className="text-xs text-muted-foreground">
                Select an institution before uploading photos.
              </p>
            )}
          </div>

          {/* Promotional materials */}
          <PromotionalMaterialsRepeater
            value={materials}
            onChange={setMaterials}
            disabled={isPending}
          />

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="stall-notes">Notes</Label>
            <Textarea
              id="stall-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Setup notes, footfall observations, learnings…"
              rows={3}
              disabled={isPending}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isEdit ? 'Saving…' : 'Creating…'}
                </>
              ) : isEdit ? (
                'Save Changes'
              ) : (
                'Create Stall'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
