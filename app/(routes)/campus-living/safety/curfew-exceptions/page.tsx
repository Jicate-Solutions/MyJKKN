'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/dialog';
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
  Clock,
  Search,
  Plus,
  CheckCircle2,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  useHostelCurfewExceptions,
  useCreateHostelCurfewException,
  useDeleteHostelCurfewException,
} from '@/hooks/campus-living/use-campus-living-settings';
import { BlockSelector } from '@/components/campus-living/block-selector';
import type { CurfewExceptionType } from '@/types/campus-living';

const EXCEPTION_TYPES: Array<{ value: CurfewExceptionType; label: string }> = [
  { value: 'one_time', label: 'One-time' },
  { value: 'event', label: 'Event' },
  { value: 'exam_period', label: 'Exam Period' },
  { value: 'medical', label: 'Medical' },
  { value: 'permanent', label: 'Permanent' },
];

export default function CurfewExceptionsPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const userId = profile?.id || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Form fields
  const [formType, setFormType] = useState<CurfewExceptionType>('one_time');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formBlockId, setFormBlockId] = useState<string>('all');
  const [formNewCurfew, setFormNewCurfew] = useState('23:00');
  const [formStartDate, setFormStartDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [formEndDate, setFormEndDate] = useState('');

  const { data: exceptions = [], isLoading } = useHostelCurfewExceptions(
    institutionId,
    activeOnly
  );
  const createMutation = useCreateHostelCurfewException();
  const deleteMutation = useDeleteHostelCurfewException();

  const filteredExceptions = useMemo(() => {
    if (!searchQuery) return exceptions;
    const q = searchQuery.toLowerCase();
    return exceptions.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q)
    );
  }, [exceptions, searchQuery]);

  const stats = useMemo(
    () => ({
      total: exceptions.length,
      active: exceptions.filter((e) => e.is_active).length,
      permanent: exceptions.filter((e) => e.exception_type === 'permanent').length,
    }),
    [exceptions]
  );

  const resetForm = () => {
    setFormType('one_time');
    setFormTitle('');
    setFormDescription('');
    setFormBlockId('all');
    setFormNewCurfew('23:00');
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormEndDate('');
  };

  const handleCreate = () => {
    if (!institutionId || !userId) return;
    if (!formTitle.trim() || !formNewCurfew || !formStartDate) return;

    createMutation.mutate(
      {
        institution_id: institutionId,
        approved_by: userId,
        block_id: formBlockId !== 'all' ? formBlockId : null,
        exception_type: formType,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        applies_to_learner_ids: null,
        new_curfew_time: formNewCurfew,
        start_date: formStartDate,
        end_date: formEndDate || null,
        is_active: true,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          resetForm();
        },
      }
    );
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this curfew exception?')) {
      deleteMutation.mutate(id);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'permanent':
        return (
          <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
            Permanent
          </Badge>
        );
      case 'medical':
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Medical</Badge>
        );
      case 'event':
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Event</Badge>
        );
      case 'exam_period':
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            Exam Period
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="capitalize">
            {type.replace('_', ' ')}
          </Badge>
        );
    }
  };

  return (
    <ContentLayout title="Curfew Exceptions">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Curfew Exceptions</h1>
            <p className="text-muted-foreground">
              Block- or learner-scoped overrides to the standard curfew
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} disabled={!institutionId}>
            <Plus className="mr-2 h-4 w-4" />
            New Exception
          </Button>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Loaded</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Currently Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Permanent</p>
              <p className="text-2xl font-bold text-purple-600">{stats.permanent}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search title or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select
                value={activeOnly ? 'active' : 'all'}
                onValueChange={(v) => setActiveOnly(v === 'active')}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="all">All (incl. inactive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading exceptions…
              </div>
            ) : filteredExceptions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No curfew exceptions match the current filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>New Curfew</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExceptions.map((exc) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const block = (exc as any).hostel_blocks as
                      | { name?: string; code?: string }
                      | null;
                    return (
                      <TableRow key={exc.id}>
                        <TableCell className="font-medium">
                          {exc.title}
                          {exc.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {exc.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{getTypeBadge(exc.exception_type)}</TableCell>
                        <TableCell className="text-sm">
                          {block?.name ?? (
                            <span className="text-muted-foreground">All blocks</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {exc.new_curfew_time}
                        </TableCell>
                        <TableCell className="text-sm">
                          {exc.start_date}
                          {exc.end_date ? ` → ${exc.end_date}` : ''}
                        </TableCell>
                        <TableCell>
                          {exc.is_active ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              <Clock className="mr-1 h-3 w-3" />
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            onClick={() => handleDelete(exc.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Curfew Exception</DialogTitle>
            <DialogDescription>
              Override the standard curfew for a block or all blocks for a date
              range.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Cultural Fest 2026"
              />
            </div>

            <div>
              <Label htmlFor="type">Type *</Label>
              <Select
                value={formType}
                onValueChange={(v) => setFormType(v as CurfewExceptionType)}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXCEPTION_TYPES.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="block">Block (optional, all if blank)</Label>
              {institutionId ? (
                <BlockSelector
                  institutionId={institutionId}
                  value={formBlockId}
                  onValueChange={setFormBlockId}
                  className="w-full"
                />
              ) : null}
            </div>

            <div>
              <Label htmlFor="curfew">New Curfew Time *</Label>
              <Input
                id="curfew"
                type="time"
                value={formNewCurfew}
                onChange={(e) => setFormNewCurfew(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="start">Start Date *</Label>
                <Input
                  id="start"
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="end">End Date</Label>
                <Input
                  id="end"
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Why is this exception being granted?"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={
                createMutation.isPending ||
                !formTitle.trim() ||
                !formNewCurfew ||
                !formStartDate
              }
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
