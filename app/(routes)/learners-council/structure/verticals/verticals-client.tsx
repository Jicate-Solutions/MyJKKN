'use client';

/**
 * Verticals Client - CRUD management for YUVA verticals
 * Supports create, edit, soft-delete with stakeholder protection
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
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
  Layers,
  Lock,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Users,
  Puzzle
} from 'lucide-react';
import {
  useVerticals,
  useCreateVertical,
  useUpdateVertical,
  useDeleteVertical
} from '@/hooks/learners-council/use-lc-structure';
import type { YUVAVertical, CreateYUVAVerticalDto, UpdateYUVAVerticalDto } from '@/types/learners-council';

// ============================================================================
// TYPES
// ============================================================================

interface VerticalsClientProps {
  initialVerticals: YUVAVertical[];
  chapters: { id: string; name: string; institutionName: string }[];
  memberCounts: Record<string, number>;
  isStaffOrAdmin: boolean;
}

type FilterType = 'all' | 'stakeholder' | 'vertical';
type FilterStatus = 'all' | 'active' | 'inactive';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VerticalsClient({
  initialVerticals,
  chapters,
  memberCounts,
  isStaffOrAdmin
}: VerticalsClientProps) {
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [editingVertical, setEditingVertical] = useState<YUVAVertical | null>(null);
  const [deletingVertical, setDeletingVertical] = useState<YUVAVertical | null>(null);

  // Use React Query for live data, fall back to initial server data
  const { data: verticals } = useVerticals();
  const displayVerticals = verticals || initialVerticals;

  // Apply filters
  const filteredVerticals = displayVerticals.filter((v) => {
    if (filterType !== 'all' && v.type !== filterType) return false;
    if (filterStatus === 'active' && !v.is_active) return false;
    if (filterStatus === 'inactive' && v.is_active) return false;
    return true;
  });

  // Stats
  const totalActive = displayVerticals.filter((v) => v.is_active).length;
  const stakeholderCount = displayVerticals.filter((v) => v.type === 'stakeholder').length;
  const configurableCount = displayVerticals.filter((v) => v.type === 'vertical').length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Layers className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActive}</p>
                <p className="text-sm text-muted-foreground">Active Verticals</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stakeholderCount}</p>
                <p className="text-sm text-muted-foreground">Stakeholders (Fixed)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Puzzle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{configurableCount}</p>
                <p className="text-sm text-muted-foreground">Configurable Verticals</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions & Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {isStaffOrAdmin && (
          <CreateVerticalDialog />
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
            <SelectTrigger className="w-[150px] h-9 text-sm">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="stakeholder">Stakeholders</SelectItem>
              <SelectItem value="vertical">Verticals</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Verticals Table */}
      {filteredVerticals.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Icon</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  {isStaffOrAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVerticals.map((vertical) => (
                  <TableRow key={vertical.id} className={!vertical.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <span className="text-lg">{vertical.icon || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{vertical.name}</span>
                          {vertical.type === 'stakeholder' && (
                            <Lock className="h-3.5 w-3.5 text-purple-500" title="Stakeholder - cannot be deleted" />
                          )}
                        </div>
                        {vertical.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {vertical.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          vertical.type === 'stakeholder'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-blue-50 text-blue-700 border-blue-200'
                        }
                      >
                        {vertical.type === 'stakeholder' ? 'Stakeholder' : 'Vertical'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{memberCounts[vertical.id] || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {vertical.is_active ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {vertical.sort_order}
                    </TableCell>
                    {isStaffOrAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditingVertical(vertical)}
                            title="Edit vertical"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {vertical.type !== 'stakeholder' && vertical.is_active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setDeletingVertical(vertical)}
                              title="Deactivate vertical"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="font-medium text-lg">No verticals configured</h3>
            <p className="text-sm mt-1">Add your first vertical to get started.</p>
            {isStaffOrAdmin && (
              <div className="mt-4">
                <CreateVerticalDialog />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      {editingVertical && (
        <EditVerticalDialog
          vertical={editingVertical}
          onClose={() => setEditingVertical(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deletingVertical && (
        <DeleteVerticalDialog
          vertical={deletingVertical}
          memberCount={memberCounts[deletingVertical.id] || 0}
          onClose={() => setDeletingVertical(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// CREATE VERTICAL DIALOG
// ============================================================================

function CreateVerticalDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'stakeholder' | 'vertical'>('vertical');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [sortOrder, setSortOrder] = useState('10');

  const createVertical = useCreateVertical();

  const handleSubmit = async () => {
    if (!name) return;

    const data: CreateYUVAVerticalDto = {
      name,
      type,
      description: description || undefined,
      icon: icon || undefined,
      sort_order: parseInt(sortOrder) || 10
    };

    await createVertical.mutateAsync(data);

    setName('');
    setType('vertical');
    setDescription('');
    setIcon('');
    setSortOrder('10');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Vertical
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create YUVA Vertical</DialogTitle>
          <DialogDescription>
            Verticals are shared across all chapters. Stakeholders are fixed categories (Membership, Thalir, Rural Initiatives), verticals are configurable.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input
              placeholder="e.g., Sports, Innovation, Climate Change"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as 'stakeholder' | 'vertical')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stakeholder">Stakeholder (fixed, non-deletable)</SelectItem>
                <SelectItem value="vertical">Vertical (configurable)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Icon (emoji)</Label>
              <Input
                placeholder="e.g., one emoji"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={4}
              />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input
                type="number"
                placeholder="10"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                min={0}
              />
            </div>
          </div>
          <div>
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="What this vertical covers..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name || createVertical.isPending}>
            {createVertical.isPending ? 'Creating...' : 'Create Vertical'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EDIT VERTICAL DIALOG
// ============================================================================

function EditVerticalDialog({
  vertical,
  onClose
}: {
  vertical: YUVAVertical;
  onClose: () => void;
}) {
  const [name, setName] = useState(vertical.name);
  const [description, setDescription] = useState(vertical.description || '');
  const [icon, setIcon] = useState(vertical.icon || '');
  const [sortOrder, setSortOrder] = useState(String(vertical.sort_order));
  const [isActive, setIsActive] = useState(vertical.is_active);

  const updateVertical = useUpdateVertical();

  const handleSubmit = async () => {
    if (!name) return;

    const data: UpdateYUVAVerticalDto = {
      name,
      description: description || undefined,
      icon: icon || undefined,
      sort_order: parseInt(sortOrder) || vertical.sort_order,
      is_active: isActive
    };

    await updateVertical.mutateAsync({ id: vertical.id, data });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Vertical</DialogTitle>
          <DialogDescription>
            Update the vertical details. Type cannot be changed after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label>Type</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant="outline"
                className={
                  vertical.type === 'stakeholder'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }
              >
                {vertical.type === 'stakeholder' ? 'Stakeholder (fixed)' : 'Vertical (configurable)'}
              </Badge>
              <span className="text-xs text-muted-foreground">Cannot be changed</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Icon (emoji)</Label>
              <Input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                maxLength={4}
                placeholder="e.g., one emoji"
              />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                min={0}
              />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this vertical covers..."
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={isActive ? 'active' : 'inactive'} onValueChange={(v) => setIsActive(v === 'active')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name || updateVertical.isPending}>
            {updateVertical.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// DELETE VERTICAL CONFIRMATION
// ============================================================================

function DeleteVerticalDialog({
  vertical,
  memberCount,
  onClose
}: {
  vertical: YUVAVertical;
  memberCount: number;
  onClose: () => void;
}) {
  const deleteVertical = useDeleteVertical();

  const handleDelete = async () => {
    await deleteVertical.mutateAsync(vertical.id);
    onClose();
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate &ldquo;{vertical.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will deactivate the vertical. It will no longer appear in active vertical lists.
            {memberCount > 0 && (
              <span className="block mt-2 font-medium text-amber-600">
                {memberCount} active member{memberCount !== 1 ? 's' : ''} will be removed from this vertical.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteVertical.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteVertical.isPending ? 'Deactivating...' : 'Deactivate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
