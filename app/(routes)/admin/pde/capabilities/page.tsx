'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  useAllCapabilities,
  useCreateCapability,
  useUpdateCapability,
} from '@/hooks/pde/use-pde-phase2';
import { BeatLoader } from 'react-spinners';
import {
  Plus,
  Search,
  Zap,
  Pencil,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PDECapability, CapabilityCategory, CreateCapabilityInput } from '@/types/pde';

// ============================================
// Constants
// ============================================

const CATEGORY_CONFIG: Record<CapabilityCategory, { label: string; color: string }> = {
  ai_fluency: { label: 'AI Fluency', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40' },
  domain_ai: { label: 'Domain AI', color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40' },
  cross_functional: { label: 'Cross-Functional', color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40' },
  production: { label: 'Production', color: 'bg-red-100 text-red-700 dark:bg-red-950/40' },
  human_presence: { label: 'Human Presence', color: 'bg-pink-100 text-pink-700 dark:bg-pink-950/40' },
  principal: { label: 'Principal', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40' },
  technical: { label: 'Technical', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40' },
  professional: { label: 'Professional', color: 'bg-green-100 text-green-700 dark:bg-green-950/40' },
};

const FINKS_DIMENSIONS = [
  'foundational_knowledge',
  'application',
  'integration',
  'human_dimension',
  'caring',
  'learning_how_to_learn',
];

// ============================================
// Create/Edit Dialog
// ============================================

function CapabilityDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: PDECapability | null;
}) {
  const createCapability = useCreateCapability();
  const updateCapability = useUpdateCapability();

  const [name, setName] = useState(existing?.name || '');
  const [slug, setSlug] = useState(existing?.slug || '');
  const [description, setDescription] = useState(existing?.description || '');
  const [category, setCategory] = useState<CapabilityCategory>(existing?.category || 'technical');
  const [level, setLevel] = useState(existing?.level?.toString() || '1');
  const [finksDimension, setFinksDimension] = useState(existing?.finks_dimension || '');
  const [estimatedHours, setEstimatedHours] = useState(existing?.estimated_hours?.toString() || '');
  const [isCore, setIsCore] = useState(existing?.is_core || false);

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val);
    if (!existing) {
      setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    }
  };

  const handleSubmit = async () => {
    const input: CreateCapabilityInput = {
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      category,
      level: parseInt(level) || 1,
      finks_dimension: finksDimension || undefined,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : undefined,
      is_core: isCore,
    };

    try {
      if (existing) {
        await updateCapability.mutateAsync({ id: existing.id, input });
      } else {
        await createCapability.mutateAsync(input);
      }
      onOpenChange(false);
    } catch {
      // mutation handles error
    }
  };

  const isPending = createCapability.isPending || updateCapability.isPending;
  const isValid = name.trim() && slug.trim() && description.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit Capability' : 'Create Capability'}</DialogTitle>
          <DialogDescription>
            Define a skill node in the capability tree
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="e.g., Prompt Engineering"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Slug *</Label>
            <Input
              placeholder="e.g., prompt-engineering"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label>Description *</Label>
            <Textarea
              placeholder="What does this capability represent?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as CapabilityCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Level (1-5)</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((l) => (
                    <SelectItem key={l} value={l.toString()}>
                      Level {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fink&apos;s Dimension</Label>
              <Select value={finksDimension || 'none'} onValueChange={(v) => setFinksDimension(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {FINKS_DIMENSIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estimated Hours</Label>
              <Input
                type="number"
                step="0.5"
                placeholder="e.g., 10"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Core Capability</Label>
              <p className="text-xs text-muted-foreground">Required for CASE graduation</p>
            </div>
            <Switch checked={isCore} onCheckedChange={setIsCore} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !isValid}>
            {isPending ? <BeatLoader color="#fff" size={8} /> : existing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================
// Main Page
// ============================================

export default function AdminCapabilitiesPage() {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCapability, setEditingCapability] = useState<PDECapability | null>(null);

  const { data: capabilities, isLoading } = useAllCapabilities();

  const filtered = (capabilities || []).filter((c: PDECapability) => {
    if (filterCategory !== 'all' && c.category !== filterCategory) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      return c.name.toLowerCase().includes(s) || c.slug.toLowerCase().includes(s);
    }
    return true;
  });

  const handleEdit = (cap: PDECapability) => {
    setEditingCapability(cap);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingCapability(null);
    setDialogOpen(true);
  };

  return (
    <ContentLayout title="Capability Management">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/vac/admin' },
          { label: 'PDE', href: '/admin/pde/assessments' },
          { label: 'Capabilities' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Capability Management</h1>
            <p className="text-sm text-muted-foreground">
              Define and manage the skill tree for the Principal Development Engine
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Capability
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search capabilities..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CATEGORY_CONFIG).map(([key, val]) => (
                    <SelectItem key={key} value={key}>
                      {val.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{capabilities?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Total Capabilities</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {capabilities?.filter((c: PDECapability) => c.is_core).length || 0}
              </p>
              <p className="text-xs text-muted-foreground">Core (Required)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {new Set(capabilities?.map((c: PDECapability) => c.category) || []).size}
              </p>
              <p className="text-xs text-muted-foreground">Categories</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">
                {capabilities?.filter((c: PDECapability) => c.lesson_ids && c.lesson_ids.length > 0).length || 0}
              </p>
              <p className="text-xs text-muted-foreground">With Lessons</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#00e902" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Zap className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <p className="text-muted-foreground mb-4">
                  {search || filterCategory !== 'all'
                    ? 'No capabilities match your filters'
                    : 'No capabilities defined yet'}
                </p>
                {!search && filterCategory === 'all' && (
                  <Button variant="outline" onClick={handleCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Capability
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Level</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Fink&apos;s</TableHead>
                    <TableHead className="text-center">Core</TableHead>
                    <TableHead className="text-center hidden md:table-cell">Lessons</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((cap: PDECapability) => {
                    const catConfig = CATEGORY_CONFIG[cap.category];
                    return (
                      <TableRow key={cap.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{cap.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{cap.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', catConfig.color)}>
                            {catConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="text-xs">
                            L{cap.level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {cap.finks_dimension ? (
                            <span className="text-xs capitalize">
                              {cap.finks_dimension.replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {cap.is_core ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                          ) : (
                            <span className="text-xs text-muted-foreground">--</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <span className="flex items-center justify-center gap-1 text-xs">
                            <BookOpen className="h-3 w-3" />
                            {cap.lesson_ids?.length || 0}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(cap)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <CapabilityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editingCapability}
      />
    </ContentLayout>
  );
}
