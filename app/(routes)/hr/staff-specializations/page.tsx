'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tags, Loader2, CheckCircle2, X, Star, Users } from 'lucide-react';
import {
  useStaffSpecializations,
  useAddSpecialization,
  useBulkAddSpecializations,
  useRemoveSpecialization,
  useVerifySpecialization,
  useInstitutions,
  useSpecializationsList,
} from '@/hooks/hr/recruitment-need/use-data-entry';
import type { StaffWithSpecializations } from '@/lib/services/hr/recruitment-need/data-entry-service';

export default function StaffSpecializationsPage() {
  const [filterInstitution, setFilterInstitution] = useState<string>('');
  const [filterSpec, setFilterSpec] = useState<string>('');
  const [untaggedOnly, setUntaggedOnly] = useState(false);

  const filters = useMemo(() => ({
    institution_id: filterInstitution || undefined,
    specialization_id: filterSpec || undefined,
    untagged_only: untaggedOnly || undefined,
  }), [filterInstitution, filterSpec, untaggedOnly]);

  const { data: staffList, isLoading } = useStaffSpecializations(filters);
  const { data: institutions } = useInstitutions();
  const { data: specializations } = useSpecializationsList();
  const addMut = useAddSpecialization();
  const bulkMut = useBulkAddSpecializations();
  const removeMut = useRemoveSpecialization();
  const verifyMut = useVerifySpecialization();

  // Selection for bulk operations
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkSpecId, setBulkSpecId] = useState('');

  // Per-staff edit dialog
  const [editStaff, setEditStaff] = useState<StaffWithSpecializations | null>(null);
  const [addSpecDialogOpen, setAddSpecDialogOpen] = useState(false);
  const [newSpecId, setNewSpecId] = useState('');

  // Remove confirmation
  const [removeId, setRemoveId] = useState<string | null>(null);

  const toggleStaffSelection = (staffId: string) => {
    setSelectedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const toggleAll = () => {
    if (!staffList) return;
    if (selectedStaff.size === staffList.length) {
      setSelectedStaff(new Set());
    } else {
      setSelectedStaff(new Set(staffList.map((s) => s.id)));
    }
  };

  const handleBulkTag = async () => {
    if (!bulkSpecId || selectedStaff.size === 0) return;
    await bulkMut.mutateAsync({
      staff_ids: Array.from(selectedStaff),
      specialization_id: bulkSpecId,
    });
    setBulkDialogOpen(false);
    setBulkSpecId('');
    setSelectedStaff(new Set());
  };

  const handleAddSpec = async () => {
    if (!editStaff || !newSpecId) return;
    await addMut.mutateAsync({
      staff_id: editStaff.id,
      specialization_id: newSpecId,
    });
    setNewSpecId('');
  };

  const handleRemoveSpec = async () => {
    if (!removeId) return;
    await removeMut.mutateAsync(removeId);
    setRemoveId(null);
    // Refresh edit staff data
    if (editStaff) {
      setEditStaff({
        ...editStaff,
        specializations: editStaff.specializations.filter((s) => s.id !== removeId),
      });
    }
  };

  const handleVerify = async (specRowId: string) => {
    await verifyMut.mutateAsync(specRowId);
  };

  const specName = (id: string) =>
    specializations?.find((s) => s.id === id)?.name ?? id;

  return (
    <ContentLayout title="Staff Specializations">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Staff Specialization Tagging</h1>
          </div>
          {selectedStaff.size > 0 && (
            <Button onClick={() => setBulkDialogOpen(true)} size="sm">
              <Users className="mr-1 h-4 w-4" /> Bulk Tag ({selectedStaff.size} staff)
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <Select value={filterInstitution} onValueChange={(v) => setFilterInstitution(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Institutions</SelectItem>
              {institutions?.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSpec} onValueChange={(v) => setFilterSpec(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All Specializations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Specializations</SelectItem>
              {specializations?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Checkbox
              id="untagged"
              checked={untaggedOnly}
              onCheckedChange={(v) => setUntaggedOnly(v === true)}
            />
            <label htmlFor="untagged" className="text-sm cursor-pointer">Untagged only</label>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={staffList?.length ? selectedStaff.size === staffList.length : false}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Staff Name</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Specializations</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!staffList || staffList.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No staff found.
                    </TableCell>
                  </TableRow>
                )}
                {staffList?.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedStaff.has(s.id)}
                        onCheckedChange={() => toggleStaffSelection(s.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {s.first_name} {s.last_name}
                    </TableCell>
                    <TableCell>{s.institution_name ?? '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {s.specializations.length === 0 && (
                          <Badge variant="outline" className="text-muted-foreground">No specializations</Badge>
                        )}
                        {s.specializations.map((sp) => (
                          <Badge
                            key={sp.id}
                            variant={sp.is_primary ? 'default' : 'secondary'}
                            className="flex items-center gap-1"
                          >
                            {sp.is_primary && <Star className="h-3 w-3" />}
                            {sp.specialization_name}
                            {sp.verified_at && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditStaff(s); setAddSpecDialogOpen(true); }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Bulk Tag Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Assign Specialization</DialogTitle>
            <DialogDescription>
              Assign a specialization to {selectedStaff.size} selected staff members.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Select value={bulkSpecId} onValueChange={setBulkSpecId}>
              <SelectTrigger><SelectValue placeholder="Select specialization" /></SelectTrigger>
              <SelectContent>
                {specializations?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkTag} disabled={bulkMut.isPending || !bulkSpecId}>
              {bulkMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Assign to {selectedStaff.size} Staff
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Per-Staff Edit Dialog */}
      <Dialog open={addSpecDialogOpen} onOpenChange={(open) => { if (!open) { setAddSpecDialogOpen(false); setEditStaff(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Manage Specializations: {editStaff?.first_name} {editStaff?.last_name}
            </DialogTitle>
            <DialogDescription>
              Add, remove, or verify specializations for this staff member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Current specializations */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Current Specializations</p>
              {editStaff?.specializations.length === 0 && (
                <p className="text-sm text-muted-foreground">None assigned.</p>
              )}
              {editStaff?.specializations.map((sp) => (
                <div key={sp.id} className="flex items-center justify-between rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    {sp.is_primary && <Star className="h-4 w-4 text-yellow-500" />}
                    <span className="text-sm font-medium">{sp.specialization_name}</span>
                    {sp.verified_at && (
                      <Badge variant="outline" className="text-xs text-green-600">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" /> Verified
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {!sp.verified_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleVerify(sp.id)}
                        disabled={verifyMut.isPending}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Verify
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setRemoveId(sp.id)}
                      className="h-8 w-8"
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add new */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Add Specialization</p>
              <div className="flex gap-2">
                <Select value={newSpecId} onValueChange={setNewSpecId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Select specialization" /></SelectTrigger>
                  <SelectContent>
                    {specializations
                      ?.filter((s) => !editStaff?.specializations.some((es) => es.specialization_id === s.id))
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddSpec} disabled={addMut.isPending || !newSpecId} size="sm">
                  {addMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Add
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddSpecDialogOpen(false); setEditStaff(null); }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={!!removeId} onOpenChange={(open) => { if (!open) setRemoveId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Specialization?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the specialization tag from this staff member.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveSpec} className="bg-destructive text-destructive-foreground">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
