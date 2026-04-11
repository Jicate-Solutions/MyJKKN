'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
  Swords,
  PlusCircle,
  ExternalLink,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  useCompetitors,
  useAddCompetitor,
  useUpdateCompetitor,
  useRemoveCompetitor,
} from '@/hooks/startup-studio';

const COMPETITOR_TYPE_LABELS: Record<string, string> = {
  direct: 'Direct',
  indirect: 'Indirect',
  substitute: 'Substitute',
};

const COMPETITOR_TYPE_COLORS: Record<string, string> = {
  direct: 'bg-red-100 text-red-800 border-red-200',
  indirect: 'bg-amber-100 text-amber-800 border-amber-200',
  substitute: 'bg-blue-100 text-blue-800 border-blue-200',
};

interface CompetitorFormState {
  competitor_name: string;
  competitor_website: string;
  type: string;
  our_advantage: string;
  their_advantage: string;
  strategic_response: string;
}

const EMPTY_FORM: CompetitorFormState = {
  competitor_name: '',
  competitor_website: '',
  type: 'direct',
  our_advantage: '',
  their_advantage: '',
  strategic_response: '',
};

interface CompetitiveTabProps {
  candidateId: string;
}

// Usage:
// <CompetitiveTab candidateId="uuid-of-candidate" />

export function CompetitiveTab({ candidateId }: CompetitiveTabProps) {
  const { data: rawData, isLoading } = useCompetitors(candidateId);
  const addCompetitor = useAddCompetitor();
  const updateCompetitor = useUpdateCompetitor();
  const removeCompetitor = useRemoveCompetitor();

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CompetitorFormState>(EMPTY_FORM);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const competitors: any[] = Array.isArray(rawData)
    ? rawData
    : (rawData as any)?.data ?? [];

  const setField = (key: keyof CompetitorFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleOpenAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAddDialogOpen(true);
  };

  const handleOpenEdit = (competitor: any) => {
    setForm({
      competitor_name: competitor.competitor_name ?? '',
      competitor_website: competitor.competitor_website ?? '',
      type: competitor.type ?? 'direct',
      our_advantage: competitor.our_advantage ?? '',
      their_advantage: competitor.their_advantage ?? '',
      strategic_response: competitor.strategic_response ?? '',
    });
    setEditingId(competitor.id);
    setAddDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.competitor_name) return;

    if (editingId) {
      await updateCompetitor.mutateAsync({
        id: editingId,
        data: { ...form },
      });
    } else {
      await addCompetitor.mutateAsync({
        candidate_id: candidateId,
        ...form,
      });
    }
    setAddDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleDelete = async (id: string) => {
    await removeCompetitor.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const isPending = addCompetitor.isPending || updateCompetitor.isPending;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5 text-blue-600" />
            Competitive Analysis
          </CardTitle>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={handleOpenAdd}>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Competitor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? 'Edit Competitor' : 'Add Competitor'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Name */}
                <div className="space-y-1.5">
                  <Label htmlFor="comp-name">Competitor Name *</Label>
                  <Input
                    id="comp-name"
                    placeholder="e.g. Acme Corp"
                    value={form.competitor_name}
                    onChange={(e) => setField('competitor_name', e.target.value)}
                  />
                </div>

                {/* Website */}
                <div className="space-y-1.5">
                  <Label htmlFor="comp-website">Website</Label>
                  <Input
                    id="comp-website"
                    placeholder="https://..."
                    type="url"
                    value={form.competitor_website}
                    onChange={(e) => setField('competitor_website', e.target.value)}
                  />
                </div>

                {/* Type */}
                <div className="space-y-1.5">
                  <Label>Competitor Type</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setField('type', v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct — Same target market, similar solution</SelectItem>
                      <SelectItem value="indirect">Indirect — Different approach, same problem</SelectItem>
                      <SelectItem value="substitute">Substitute — Alternative customers use instead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Our advantage */}
                <div className="space-y-1.5">
                  <Label htmlFor="our-adv">Our Advantage</Label>
                  <Textarea
                    id="our-adv"
                    placeholder="What do we do better?"
                    rows={2}
                    value={form.our_advantage}
                    onChange={(e) => setField('our_advantage', e.target.value)}
                  />
                </div>

                {/* Their advantage */}
                <div className="space-y-1.5">
                  <Label htmlFor="their-adv">Their Advantage</Label>
                  <Textarea
                    id="their-adv"
                    placeholder="Where are they stronger?"
                    rows={2}
                    value={form.their_advantage}
                    onChange={(e) => setField('their_advantage', e.target.value)}
                  />
                </div>

                {/* Strategic response */}
                <div className="space-y-1.5">
                  <Label htmlFor="strat-resp">Strategic Response</Label>
                  <Textarea
                    id="strat-resp"
                    placeholder="How will we respond to this competitor?"
                    rows={2}
                    value={form.strategic_response}
                    onChange={(e) => setField('strategic_response', e.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setAddDialogOpen(false);
                      setEditingId(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isPending || !form.competitor_name}
                  >
                    {isPending ? 'Saving...' : editingId ? 'Update' : 'Add Competitor'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {competitors.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <Swords className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">No competitive analysis recorded yet.</p>
              <p className="text-sm text-muted-foreground">
                Add competitors to build the competitive matrix.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competitor</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Our Advantage</TableHead>
                    <TableHead>Their Advantage</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitors.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{c.competitor_name}</p>
                          {c.competitor_website && (
                            <a
                              href={c.competitor_website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Website
                            </a>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`border ${COMPETITOR_TYPE_COLORS[c.type] ?? 'bg-gray-100 text-gray-800'}`}
                        >
                          {COMPETITOR_TYPE_LABELS[c.type] ?? c.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-sm truncate" title={c.our_advantage}>
                          {c.our_advantage || <span className="text-muted-foreground">—</span>}
                        </p>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <p className="text-sm truncate" title={c.their_advantage}>
                          {c.their_advantage || <span className="text-muted-foreground">—</span>}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOpenEdit(c)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span className="sr-only">Edit</span>
                          </Button>

                          {/* Delete with inline confirm */}
                          {deleteConfirmId === c.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => handleDelete(c.id)}
                                disabled={removeCompetitor.isPending}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => setDeleteConfirmId(null)}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirmId(c.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Strategic notes detail — expandable per competitor */}
      {competitors.some((c: any) => c.strategic_response) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Strategic Responses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {competitors
              .filter((c: any) => c.strategic_response)
              .map((c: any) => (
                <div key={c.id} className="border rounded-lg p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{c.competitor_name}</p>
                    <Badge
                      variant="outline"
                      className={`border text-xs ${COMPETITOR_TYPE_COLORS[c.type] ?? ''}`}
                    >
                      {COMPETITOR_TYPE_LABELS[c.type] ?? c.type}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{c.strategic_response}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
