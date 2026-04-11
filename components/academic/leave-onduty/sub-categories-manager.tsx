'use client';

/**
 * Sub-Categories Manager
 *
 * Admin UI for managing leave/onduty sub-categories dynamically.
 * Rendered inside the leave-onduty settings page as a dedicated tab.
 *
 * Features:
 *   - Lists sub-categories grouped by Leave / OnDuty
 *   - Create, edit, activate/deactivate, delete operations
 *   - Institution scoping (super admin can pick any institution)
 *   - Read-only code field on edit to preserve referential integrity
 *
 * @module components/academic/leave-onduty/sub-categories-manager
 * @created 2026-04-11
 */

import { useState } from 'react';
import {
  useLeaveOndutySubCategories,
  useCreateLeaveOndutySubCategory,
  useUpdateLeaveOndutySubCategory,
  useSetLeaveOndutySubCategoryActive,
  useDeleteLeaveOndutySubCategory,
} from '@/hooks/academic/use-leave-onduty-sub-categories';
import type {
  LeaveOndutyCategory,
  LeaveOndutySubCategoryRecord,
} from '@/types/leave-onduty';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Plus,
  Edit,
  Trash2,
  Power,
  PowerOff,
  AlertCircle,
  FolderTree,
} from 'lucide-react';

interface SubCategoriesManagerProps {
  /** Current scope. Null = super admin viewing all institutions. */
  institutionId: string | null;
  /** ID of the logged-in user creating rows. */
  currentUserId: string | null;
  /** Whether the current user is a super admin (affects institution picker). */
  isSuperAdmin: boolean;
  /** Available institutions (only used in super-admin create flow). */
  institutions: Array<{ id: string; name: string }>;
}

export function SubCategoriesManager({
  institutionId,
  currentUserId,
  isSuperAdmin,
  institutions,
}: SubCategoriesManagerProps) {
  // Dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<LeaveOndutySubCategoryRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeaveOndutySubCategoryRecord | null>(null);

  // Form state
  const [formInstitutionId, setFormInstitutionId] = useState<string>(institutionId || '');
  const [formCategory, setFormCategory] = useState<LeaveOndutyCategory>('leave');
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Data
  const { data: subCategories, isLoading, error } = useLeaveOndutySubCategories(institutionId);
  const createMutation = useCreateLeaveOndutySubCategory();
  const updateMutation = useUpdateLeaveOndutySubCategory();
  const toggleActiveMutation = useSetLeaveOndutySubCategoryActive();
  const deleteMutation = useDeleteLeaveOndutySubCategory();

  const resetForm = () => {
    setFormInstitutionId(institutionId || '');
    setFormCategory('leave');
    setFormCode('');
    setFormName('');
    setFormDescription('');
  };

  const openCreateDialog = () => {
    resetForm();
    setCreateDialogOpen(true);
  };

  const openEditDialog = (row: LeaveOndutySubCategoryRecord) => {
    setEditingRow(row);
    setFormName(row.name);
    setFormDescription(row.description || '');
  };

  const handleCreate = () => {
    if (!formInstitutionId || !formCode.trim() || !formName.trim()) return;

    createMutation.mutate(
      {
        data: {
          institution_id: formInstitutionId,
          category: formCategory,
          code: formCode,
          name: formName,
          description: formDescription,
        },
        createdBy: currentUserId,
      },
      {
        onSuccess: () => {
          setCreateDialogOpen(false);
          resetForm();
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!editingRow) return;
    updateMutation.mutate(
      {
        id: editingRow.id,
        data: {
          name: formName,
          description: formDescription,
        },
      },
      {
        onSuccess: () => {
          setEditingRow(null);
          resetForm();
        },
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const handleToggleActive = (row: LeaveOndutySubCategoryRecord) => {
    toggleActiveMutation.mutate({ id: row.id, isActive: !row.is_active });
  };

  // Auto-derive code from name while typing (friendly default; still editable)
  const handleNameChangeForCreate = (value: string) => {
    const previousSlug = slugify(formName);
    setFormName(value);
    if (!formCode || formCode === previousSlug) {
      setFormCode(slugify(value));
    }
  };

  // Group by category
  const leaveRows = (subCategories || []).filter((r) => r.category === 'leave');
  const ondutyRows = (subCategories || []).filter((r) => r.category === 'onduty');

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load sub-categories. Please refresh the page or try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Application Sub-Categories
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Define the leave and onduty types that learners can pick from when submitting applications.
          </p>
        </div>
        <Button onClick={openCreateDialog} size="sm" className="flex-shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Add Sub-Category
        </Button>
      </div>

      {/* Leave section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4 text-blue-500" />
            Leave Types ({leaveRows.length})
          </CardTitle>
          <CardDescription>
            Sub-categories available when a learner applies for leave
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leaveRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No leave sub-categories yet. Click &ldquo;Add Sub-Category&rdquo; above to create one.
            </p>
          ) : (
            <SubCategoryList
              rows={leaveRows}
              isSuperAdmin={isSuperAdmin}
              onEdit={openEditDialog}
              onToggleActive={handleToggleActive}
              onDelete={setDeleteTarget}
            />
          )}
        </CardContent>
      </Card>

      {/* OnDuty section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FolderTree className="h-4 w-4 text-purple-500" />
            OnDuty Types ({ondutyRows.length})
          </CardTitle>
          <CardDescription>
            Sub-categories available when a learner applies for onduty
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ondutyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No onduty sub-categories yet. Click &ldquo;Add Sub-Category&rdquo; above to create one.
            </p>
          ) : (
            <SubCategoryList
              rows={ondutyRows}
              isSuperAdmin={isSuperAdmin}
              onEdit={openEditDialog}
              onToggleActive={handleToggleActive}
              onDelete={setDeleteTarget}
            />
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Sub-Category</DialogTitle>
            <DialogDescription>
              Create a new sub-category that learners and admins can use in applications.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label>Institution *</Label>
                <Select value={formInstitutionId} onValueChange={setFormInstitutionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select institution" />
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
            )}

            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={formCategory}
                onValueChange={(v) => setFormCategory(v as LeaveOndutyCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leave">Leave</SelectItem>
                  <SelectItem value="onduty">OnDuty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sc-name">Display Name *</Label>
              <Input
                id="sc-name"
                value={formName}
                onChange={(e) => handleNameChangeForCreate(e.target.value)}
                placeholder="e.g., Emergency Leave"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sc-code">Code (Identifier) *</Label>
              <Input
                id="sc-code"
                value={formCode}
                onChange={(e) =>
                  setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
                }
                placeholder="e.g., emergency_leave"
              />
              <p className="text-xs text-muted-foreground">
                Used internally to store the value. Lowercase letters, digits, and underscores only.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sc-desc">Description (Optional)</Label>
              <Textarea
                id="sc-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="When should learners pick this sub-category?"
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                !formInstitutionId ||
                !formCode.trim() ||
                !formName.trim()
              }
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingRow}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRow(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Sub-Category</DialogTitle>
            <DialogDescription>
              Update the display name or description. The code cannot be changed because existing
              applications may reference it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Code (Read-Only)</Label>
              <Input value={editingRow?.code || ''} disabled />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-name">Display Name *</Label>
              <Input
                id="edit-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-desc">Description</Label>
              <Textarea
                id="edit-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRow(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formName.trim()}
            >
              {updateMutation.isPending ? 'Updating...' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sub-Category?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes <strong>{deleteTarget?.name}</strong> from the dropdown for new applications.
              <br />
              <br />
              <strong>Note:</strong> Existing applications and approval flows that reference this code will
              keep their stored value, but learners won&apos;t be able to select it going forward.
              Consider deactivating instead of deleting if you&apos;re unsure.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

interface SubCategoryListProps {
  rows: LeaveOndutySubCategoryRecord[];
  isSuperAdmin: boolean;
  onEdit: (row: LeaveOndutySubCategoryRecord) => void;
  onToggleActive: (row: LeaveOndutySubCategoryRecord) => void;
  onDelete: (row: LeaveOndutySubCategoryRecord) => void;
}

function SubCategoryList({
  rows,
  isSuperAdmin,
  onEdit,
  onToggleActive,
  onDelete,
}: SubCategoryListProps) {
  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-800">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between py-3 first:pt-0 last:pb-0 gap-2"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                {row.name}
              </span>
              <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                {row.code}
              </code>
              {!row.is_active && (
                <Badge variant="secondary" className="text-xs">
                  Inactive
                </Badge>
              )}
              {isSuperAdmin && row.institution?.name && (
                <Badge variant="outline" className="text-xs">
                  {row.institution.name}
                </Badge>
              )}
            </div>
            {row.description && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {row.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onEdit(row)}
              aria-label={`Edit ${row.name}`}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onToggleActive(row)}
              aria-label={`${row.is_active ? 'Deactivate' : 'Activate'} ${row.name}`}
            >
              {row.is_active ? (
                <PowerOff className="h-4 w-4" />
              ) : (
                <Power className="h-4 w-4 text-green-500" />
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(row)}
              className="text-red-600 hover:text-red-700"
              aria-label={`Delete ${row.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
