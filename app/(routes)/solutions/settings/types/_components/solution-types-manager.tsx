'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Check } from 'lucide-react';
import { useSolutionTypes, type SolutionTypeRecord } from '@/hooks/use-department-tracker';
import { DepartmentTrackerService } from '@/lib/services/solutions/department-tracker-service';
import { useToast } from '@/hooks/use-toast';

// ============================================
// CONSTANTS
// ============================================

const PRESET_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Green', value: '#10b981' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Orange', value: '#f97316' },
];

// ============================================
// HELPERS
// ============================================

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ============================================
// FORM STATE
// ============================================

interface TypeFormData {
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
}

const emptyForm: TypeFormData = {
  name: '',
  slug: '',
  description: '',
  icon: 'box',
  color: '#3b82f6',
};

// ============================================
// TYPE FORM COMPONENT
// ============================================

function TypeForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial: TypeFormData;
  onSubmit: (data: TypeFormData) => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [form, setForm] = useState<TypeFormData>(initial);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    setForm(initial);
    setSlugManuallyEdited(false);
  }, [initial]);

  const handleNameChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      name: value,
      slug: slugManuallyEdited ? prev.slug : generateSlug(value),
    }));
  };

  const handleSlugChange = (value: string) => {
    setSlugManuallyEdited(true);
    setForm((prev) => ({ ...prev, slug: generateSlug(value) }));
  };

  const isValid = form.name.trim().length > 0 && form.slug.trim().length > 0;

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="type-name">Name *</Label>
        <Input
          id="type-name"
          placeholder="e.g. Consulting"
          value={form.name}
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </div>

      {/* Slug */}
      <div className="space-y-2">
        <Label htmlFor="type-slug">Slug *</Label>
        <Input
          id="type-slug"
          placeholder="auto-generated-from-name"
          value={form.slug}
          onChange={(e) => handleSlugChange(e.target.value)}
          className="font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          URL-safe identifier. Auto-generated from name.
        </p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="type-description">Description</Label>
        <Textarea
          id="type-description"
          placeholder="Brief description of this solution type..."
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
      </div>

      {/* Icon */}
      <div className="space-y-2">
        <Label htmlFor="type-icon">Icon (Lucide icon name)</Label>
        <Input
          id="type-icon"
          placeholder="e.g. box, code, book-open"
          value={form.icon}
          onChange={(e) => setForm((prev) => ({ ...prev, icon: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          Enter a Lucide icon name. Default: box
        </p>
      </div>

      {/* Color */}
      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              title={preset.name}
              onClick={() => setForm((prev) => ({ ...prev, color: preset.value }))}
              className="relative w-8 h-8 rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
              style={{
                backgroundColor: preset.value,
                borderColor: form.color === preset.value ? '#000' : 'transparent',
              }}
            >
              {form.color === preset.value && (
                <Check className="w-4 h-4 text-white absolute inset-0 m-auto" />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div
            className="w-6 h-6 rounded-full border"
            style={{ backgroundColor: form.color }}
          />
          <Input
            value={form.color}
            onChange={(e) => setForm((prev) => ({ ...prev, color: e.target.value }))}
            className="w-32 font-mono text-sm"
            placeholder="#hex"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(form)}
          disabled={!isValid || submitting}
        >
          {submitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// ============================================
// TYPE CARD COMPONENT
// ============================================

function TypeCard({
  type,
  onEdit,
  onToggleActive,
  onDelete,
  togglingId,
}: {
  type: SolutionTypeRecord;
  onEdit: (type: SolutionTypeRecord) => void;
  onToggleActive: (type: SolutionTypeRecord) => void;
  onDelete: (type: SolutionTypeRecord) => void;
  togglingId: string | null;
}) {
  return (
    <Card className={!type.is_active ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left: color dot + info */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
              style={{ backgroundColor: type.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm truncate">{type.name}</h3>
                {type.is_default && (
                  <Badge variant="secondary" className="text-xs">
                    Default
                  </Badge>
                )}
                {!type.is_active && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                {type.slug}
              </p>
              {type.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {type.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Icon: <span className="font-mono">{type.icon}</span>
              </p>
            </div>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">
                {type.is_active ? 'Active' : 'Off'}
              </span>
              <Switch
                checked={type.is_active}
                onCheckedChange={() => onToggleActive(type)}
                disabled={togglingId === type.id}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(type)}
              title="Edit type"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {!type.is_default && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(type)}
                title="Delete type"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// LOADING SKELETON
// ============================================

function TypesLoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="w-4 h-4 rounded-full flex-shrink-0 mt-1" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-full" />
              </div>
              <Skeleton className="h-5 w-10" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SolutionTypesManager() {
  const { types, loading, error, refresh, createType, updateType } = useSolutionTypes(false);
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<SolutionTypeRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Open create dialog
  const handleCreate = () => {
    setEditingType(null);
    setDialogOpen(true);
  };

  // Open edit dialog
  const handleEdit = (type: SolutionTypeRecord) => {
    setEditingType(type);
    setDialogOpen(true);
  };

  // Submit create or update
  const handleSubmit = async (data: TypeFormData) => {
    setSubmitting(true);
    try {
      if (editingType) {
        await updateType(editingType.id, {
          name: data.name,
          description: data.description || undefined,
          icon: data.icon || 'box',
          color: data.color,
        });
      } else {
        await createType({
          name: data.name,
          slug: data.slug,
          description: data.description || undefined,
          icon: data.icon || 'box',
          color: data.color,
        });
      }
      setDialogOpen(false);
      setEditingType(null);
    } catch (err: any) {
      console.error('Failed to save solution type:', err.message || err);
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async (type: SolutionTypeRecord) => {
    setTogglingId(type.id);
    try {
      await updateType(type.id, { is_active: !type.is_active });
    } catch (err: any) {
      console.error('Failed to toggle solution type:', err.message || err);
    } finally {
      setTogglingId(null);
    }
  };

  // Delete (deactivate) a non-default type
  const handleDelete = async (type: SolutionTypeRecord) => {
    if (type.is_default) return;

    if (deleteConfirmId !== type.id) {
      setDeleteConfirmId(type.id);
      return;
    }

    setTogglingId(type.id);
    try {
      // Check if type has active solutions
      const hasActiveSolutions = await DepartmentTrackerService.solutionTypeHasActiveSolutions(type.id);

      if (hasActiveSolutions) {
        toast({
          title: 'Cannot delete solution type',
          description: 'This type has active solutions using it. Please reassign or close those solutions first.',
          variant: 'destructive',
        });
        setDeleteConfirmId(null);
        setTogglingId(null);
        return;
      }

      // Soft-delete by deactivating
      await updateType(type.id, { is_active: false });
      setDeleteConfirmId(null);
      toast({
        title: 'Solution type deleted',
        description: `"${type.name}" has been deactivated successfully.`,
      });
    } catch (err: any) {
      console.error('Failed to delete solution type:', err.message || err);
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete solution type',
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  // Reset delete confirmation when clicking elsewhere
  useEffect(() => {
    if (!deleteConfirmId) return;
    const timer = setTimeout(() => setDeleteConfirmId(null), 3000);
    return () => clearTimeout(timer);
  }, [deleteConfirmId]);

  // Prepare form data for editing
  const formInitial: TypeFormData = editingType
    ? {
        name: editingType.name,
        slug: editingType.slug,
        description: editingType.description || '',
        icon: editingType.icon || 'box',
        color: editingType.color || '#3b82f6',
      }
    : emptyForm;

  // ----------------------------------------
  // RENDER
  // ----------------------------------------

  if (loading) {
    return <TypesLoadingSkeleton />;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <p className="text-destructive mb-2">Failed to load solution types</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={refresh}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {types.length} type{types.length !== 1 ? 's' : ''} configured
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Add Type
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingType ? 'Edit Solution Type' : 'Create Solution Type'}
              </DialogTitle>
            </DialogHeader>
            <TypeForm
              initial={formInitial}
              onSubmit={handleSubmit}
              onCancel={() => {
                setDialogOpen(false);
                setEditingType(null);
              }}
              submitting={submitting}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Types grid */}
      {types.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-2">No solution types yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first solution type to get started.
            </p>
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Create First Type
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => (
            <TypeCard
              key={type.id}
              type={type}
              onEdit={handleEdit}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
              togglingId={togglingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
