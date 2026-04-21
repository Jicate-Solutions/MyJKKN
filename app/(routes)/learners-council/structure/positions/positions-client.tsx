'use client';

/**
 * Positions Client - CRUD management for LC positions
 * Supports create, edit, and delete (soft if referenced, hard otherwise)
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
  Award,
  Crown,
  Users,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Users2
} from 'lucide-react';
import {
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition
} from '@/hooks/learners-council/use-lc-structure';
import type { LCPosition } from '@/types/learners-council';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type PositionCategory = 'executive' | 'representative' | 'portfolio_head';
type FilterCategory = 'all' | PositionCategory;
type FilterStatus = 'all' | 'active' | 'inactive';

const CATEGORY_OPTIONS: { value: PositionCategory; label: string }[] = [
  { value: 'executive', label: 'Executive' },
  { value: 'representative', label: 'Representative' },
  { value: 'portfolio_head', label: 'Portfolio Head' }
];

const CATEGORY_LABELS: Record<string, string> = {
  executive: 'Executive',
  representative: 'Representative',
  portfolio_head: 'Portfolio Head',
  institution_president: 'Institution President',
  at_large: 'At Large'
};

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  executive: 'bg-amber-50 text-amber-700 border-amber-200',
  representative: 'bg-blue-50 text-blue-700 border-blue-200',
  portfolio_head: 'bg-purple-50 text-purple-700 border-purple-200',
  institution_president: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  at_large: 'bg-gray-50 text-gray-700 border-gray-200'
};

const CATEGORY_GROUP_ORDER = ['executive', 'representative', 'portfolio_head'] as const;

interface PositionsClientProps {
  initialPositions: LCPosition[];
  institutions: { id: string; name: string }[];
  memberCounts: Record<string, number>;
  isStaffOrAdmin: boolean;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PositionsClient({
  initialPositions,
  institutions,
  memberCounts,
  isStaffOrAdmin
}: PositionsClientProps) {
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [editingPosition, setEditingPosition] = useState<LCPosition | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<LCPosition | null>(null);

  // Live query, fall back to server data
  const { data: positions } = usePositions();
  const displayPositions = positions || initialPositions;

  const institutionMap = new Map(institutions.map((i) => [i.id, i.name]));

  // Apply filters
  const filteredPositions = displayPositions.filter((p) => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (filterStatus === 'active' && !p.is_active) return false;
    if (filterStatus === 'inactive' && p.is_active) return false;
    return true;
  });

  // Group by category for display
  const groupedPositions = new Map<string, LCPosition[]>();
  for (const p of filteredPositions) {
    const key = p.category;
    if (!groupedPositions.has(key)) groupedPositions.set(key, []);
    groupedPositions.get(key)!.push(p);
  }

  // Sort groups by conventional order first, then any leftover categories
  const sortedGroupKeys: string[] = [];
  for (const cat of CATEGORY_GROUP_ORDER) {
    if (groupedPositions.has(cat)) sortedGroupKeys.push(cat);
  }
  for (const key of groupedPositions.keys()) {
    if (!sortedGroupKeys.includes(key)) sortedGroupKeys.push(key);
  }

  // Stats (overall, unfiltered)
  const totalActive = displayPositions.filter((p) => p.is_active).length;
  const executiveCount = displayPositions.filter((p) => p.category === 'executive').length;
  const representativeCount = displayPositions.filter((p) => p.category === 'representative').length;
  const portfolioHeadCount = displayPositions.filter((p) => p.category === 'portfolio_head').length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Award className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalActive}</p>
                <p className="text-sm text-muted-foreground">Active Positions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <Crown className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{executiveCount}</p>
                <p className="text-sm text-muted-foreground">Executives</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{representativeCount}</p>
                <p className="text-sm text-muted-foreground">Representatives</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{portfolioHeadCount}</p>
                <p className="text-sm text-muted-foreground">Portfolio Heads</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions & Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {isStaffOrAdmin && <CreatePositionDialog institutions={institutions} />}
        <div className="flex items-center gap-2 ml-auto">
          <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as FilterCategory)}>
            <SelectTrigger className="w-[180px] h-9 text-sm">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="executive">Executive</SelectItem>
              <SelectItem value="representative">Representative</SelectItem>
              <SelectItem value="portfolio_head">Portfolio Head</SelectItem>
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

      {/* Grouped Tables */}
      {filteredPositions.length > 0 ? (
        <div className="space-y-6">
          {sortedGroupKeys.map((cat) => {
            const rows = groupedPositions.get(cat) || [];
            const label = CATEGORY_LABELS[cat] || cat;
            return (
              <Card key={cat}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-6 py-3 border-b bg-muted/20">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{label}</h3>
                      <Badge variant="outline" className={CATEGORY_BADGE_STYLES[cat] || ''}>
                        {rows.length}
                      </Badge>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Institution</TableHead>
                        <TableHead className="text-center">Max Holders</TableHead>
                        <TableHead className="text-center">Members</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Order</TableHead>
                        {isStaffOrAdmin && <TableHead className="w-[100px]">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((position) => (
                        <TableRow key={position.id} className={!position.is_active ? 'opacity-50' : ''}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{position.title}</div>
                              {position.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                  {position.description}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground capitalize">
                              {position.tier?.replace(/_/g, ' ') || '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {position.institution_id
                              ? (
                                <span className="text-sm">
                                  {institutionMap.get(position.institution_id) || 'Unknown'}
                                </span>
                              )
                              : <span className="text-xs text-muted-foreground italic">JKKN-wide</span>}
                          </TableCell>
                          <TableCell className="text-center text-sm">{position.max_holders}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{memberCounts[position.id] || 0}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {position.is_active ? (
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
                            {position.sort_order}
                          </TableCell>
                          {isStaffOrAdmin && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditingPosition(position)}
                                  title="Edit position"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => setDeletingPosition(position)}
                                  title="Delete position"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Award className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <h3 className="font-medium text-lg">No positions configured</h3>
            <p className="text-sm mt-1">Add your first position to get started.</p>
            {isStaffOrAdmin && (
              <div className="mt-4">
                <CreatePositionDialog institutions={institutions} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      {editingPosition && (
        <EditPositionDialog
          position={editingPosition}
          institutions={institutions}
          onClose={() => setEditingPosition(null)}
        />
      )}

      {/* Delete Confirmation */}
      {deletingPosition && (
        <DeletePositionDialog
          position={deletingPosition}
          memberCount={memberCounts[deletingPosition.id] || 0}
          onClose={() => setDeletingPosition(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// CREATE POSITION DIALOG
// ============================================================================

function CreatePositionDialog({ institutions }: { institutions: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<PositionCategory>('representative');
  const [tier, setTier] = useState('jkkn_wide');
  const [institutionId, setInstitutionId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [maxHolders, setMaxHolders] = useState('1');
  const [sortOrder, setSortOrder] = useState('100');

  const createPosition = useCreatePosition();

  const resetForm = () => {
    setTitle('');
    setCategory('representative');
    setTier('jkkn_wide');
    setInstitutionId('');
    setDescription('');
    setMaxHolders('1');
    setSortOrder('100');
  };

  const handleSubmit = async () => {
    if (!title) return;

    await createPosition.mutateAsync({
      title,
      category,
      tier,
      institution_id: category === 'representative' && institutionId ? institutionId : undefined,
      description: description || undefined,
      max_holders: parseInt(maxHolders) || 1,
      sort_order: parseInt(sortOrder) || 100
    });

    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Position
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create LC Position</DialogTitle>
          <DialogDescription>
            Add a Learners Council position. Representatives are institution-scoped; executives and portfolio heads are JKKN-wide.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Title</Label>
            <Input
              placeholder="e.g., President, Representative, Portfolio Head"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as PositionCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jkkn_wide">JKKN-wide</SelectItem>
                  <SelectItem value="yuva_chapter">YUVA Chapter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {category === 'representative' && (
            <div>
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max Holders</Label>
              <Input
                type="number"
                value={maxHolders}
                onChange={(e) => setMaxHolders(e.target.value)}
                min={1}
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
            <Label>Description (optional)</Label>
            <Textarea
              placeholder="What this position is responsible for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title || createPosition.isPending}>
            {createPosition.isPending ? 'Creating...' : 'Create Position'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EDIT POSITION DIALOG
// ============================================================================

function EditPositionDialog({
  position,
  institutions,
  onClose
}: {
  position: LCPosition;
  institutions: { id: string; name: string }[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(position.title);
  const [category, setCategory] = useState<string>(position.category);
  const [tier, setTier] = useState<string>(position.tier || 'jkkn_wide');
  const [institutionId, setInstitutionId] = useState(position.institution_id || '');
  const [description, setDescription] = useState(position.description || '');
  const [maxHolders, setMaxHolders] = useState(String(position.max_holders));
  const [sortOrder, setSortOrder] = useState(String(position.sort_order));
  const [isActive, setIsActive] = useState(position.is_active);

  const updatePosition = useUpdatePosition();

  const handleSubmit = async () => {
    if (!title) return;

    await updatePosition.mutateAsync({
      id: position.id,
      data: {
        title,
        category,
        tier,
        institution_id: category === 'representative' && institutionId ? institutionId : null,
        description: description || null,
        max_holders: parseInt(maxHolders) || position.max_holders,
        sort_order: parseInt(sortOrder) || position.sort_order,
        is_active: isActive
      }
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Position</DialogTitle>
          <DialogDescription>Update the position details.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                  {/* Allow legacy categories to remain selectable */}
                  {!CATEGORY_OPTIONS.some((o) => o.value === category) && (
                    <SelectItem value={category}>
                      {CATEGORY_LABELS[category] || category}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="jkkn_wide">JKKN-wide</SelectItem>
                  <SelectItem value="yuva_chapter">YUVA Chapter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {category === 'representative' && (
            <div>
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger><SelectValue placeholder="Select institution" /></SelectTrigger>
                <SelectContent>
                  {institutions.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Max Holders</Label>
              <Input
                type="number"
                value={maxHolders}
                onChange={(e) => setMaxHolders(e.target.value)}
                min={1}
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
              placeholder="What this position is responsible for..."
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
          <Button onClick={handleSubmit} disabled={!title || updatePosition.isPending}>
            {updatePosition.isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// DELETE POSITION CONFIRMATION
// ============================================================================

function DeletePositionDialog({
  position,
  memberCount,
  onClose
}: {
  position: LCPosition;
  memberCount: number;
  onClose: () => void;
}) {
  const deletePosition = useDeletePosition();

  const handleDelete = async () => {
    await deletePosition.mutateAsync(position.id);
    onClose();
  };

  const isSoftDelete = memberCount > 0;

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSoftDelete ? 'Deactivate' : 'Delete'} &ldquo;{position.title}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSoftDelete ? (
              <>
                This position has <span className="font-medium">{memberCount}</span> active member{memberCount !== 1 ? 's' : ''} assigned.
                It will be <span className="font-medium">deactivated</span> (not deleted) and hidden from active lists. Historical records are preserved.
              </>
            ) : (
              <>
                No members are assigned to this position, so it will be <span className="font-medium">permanently deleted</span>. This action cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deletePosition.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deletePosition.isPending
              ? (isSoftDelete ? 'Deactivating...' : 'Deleting...')
              : (isSoftDelete ? 'Deactivate' : 'Delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
