'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useCreateBosTaxonomy, useBosTaxonomies } from '@/hooks/bos/use-bos-taxonomies';
import { CreateBosTaxonomyDto } from '@/types/bos';
import { useAuth } from '@/hooks/use-auth';

interface LevelDraft {
  code: string;
  name: string;
  description: string;
  verb_examples: string;
}

const EMPTY_LEVEL: LevelDraft = { code: '', name: '', description: '', verb_examples: '' };

// Red asterisk for required fields
function Req() {
  return <span className='ml-0.5 text-destructive'>*</span>;
}

export default function NewTaxonomyPage() {
  const router = useRouter();
  const createMutation = useCreateBosTaxonomy();
  const { profile } = useAuth();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [isHierarchical, setIsHierarchical] = useState(true);
  const [levels, setLevels] = useState<LevelDraft[]>([{ ...EMPTY_LEVEL, code: 'K1' }]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!codeTouched) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 30);
      setCode(slug);
    }
  };

  const updateLevel = (idx: number, patch: Partial<LevelDraft>) =>
    setLevels((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const addLevel = () =>
    setLevels((prev) => [...prev, { ...EMPTY_LEVEL, code: `K${prev.length + 1}` }]);

  const removeLevel = (idx: number) =>
    setLevels((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');
    if (!code.trim()) return toast.error('Code is required');
    if (levels.length === 0) return toast.error('At least one level is required');
    const trimmedCodes = levels.map((l) => l.code.trim());
    if (trimmedCodes.some((c) => !c)) return toast.error('Every level needs a code');
    if (new Set(trimmedCodes).size !== trimmedCodes.length)
      return toast.error('Level codes must be unique');

    const payload: CreateBosTaxonomyDto = {
      institutions_id: profile?.institution_id ?? undefined,
      name: name.trim(),
      code: code.trim(),
      description: description.trim() || null,
      is_hierarchical: isHierarchical,
      is_active: true,
      levels: levels.map((l, idx) => ({
        code: l.code.trim(),
        name: l.name.trim() || l.code.trim(),
        description: l.description.trim() || null,
        verb_examples: l.verb_examples.split(',').map((v) => v.trim()).filter(Boolean),
        sort_order: idx + 1,
      })),
    };

    try {
      await createMutation.mutateAsync(payload);
      toast.success('Taxonomy created');
      router.push('/bos/taxonomy');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    }
  };

  return (
    <PermissionGuard module='academic.bos-taxonomy' action='create'>
      <div className='space-y-4'>
        <Button variant='ghost' size='sm' className='gap-2' onClick={() => router.back()}>
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>

        {/* Two-column layout: form (left) + reference table (right) */}
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
          {/* ── Form ─────────────────────────────────────────────────────────── */}
          <div className='lg:col-span-2'>
            <Card>
              <CardHeader>
                <CardTitle>New Taxonomy</CardTitle>
                <CardDescription>
                  Define a learning-outcome framework. Fields marked{' '}
                  <span className='text-destructive font-medium'>*</span> are required.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className='space-y-6'>
                  {/* Name + code */}
                  <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='name'>
                        Name of taxonomy<Req />
                      </Label>
                      <Input
                        id='name'
                        placeholder="e.g. Bloom's Taxonomy"
                        value={name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        required
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor='code'>
                        Code<Req />
                      </Label>
                      <Input
                        id='code'
                        placeholder='e.g. blooms'
                        value={code}
                        onChange={(e) => { setCode(e.target.value); setCodeTouched(true); }}
                        required
                      />
                      <p className='text-xs text-muted-foreground'>
                        Stable identifier used in API and exports.
                      </p>
                    </div>
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='description'>Description (optional)</Label>
                    <Textarea
                      id='description'
                      placeholder='What this framework is used for…'
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div className='flex items-center justify-between rounded-lg border p-3'>
                    <div>
                      <Label htmlFor='hierarchical' className='text-sm font-medium'>
                        Hierarchical
                      </Label>
                      <p className='text-xs text-muted-foreground'>
                        On for ordered frameworks (Bloom&apos;s K1&lt;K2&lt;…). Off for
                        independent dimensions (Fink&apos;s).
                      </p>
                    </div>
                    <Switch
                      id='hierarchical'
                      checked={isHierarchical}
                      onCheckedChange={setIsHierarchical}
                    />
                  </div>

                  {/* Levels */}
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <Label className='text-sm font-medium'>
                          Levels<Req />
                        </Label>
                        <p className='text-xs text-muted-foreground'>
                          One row per K-value / dimension. Verb examples are
                          comma-separated (e.g. <code>define, list, recall</code>).
                        </p>
                      </div>
                      <Button type='button' variant='outline' size='sm' onClick={addLevel}>
                        <Plus className='mr-2 h-4 w-4' />
                        Add level
                      </Button>
                    </div>

                    <div className='rounded-lg border'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className='w-24'>Code</TableHead>
                            <TableHead className='w-44'>Name</TableHead>
                            <TableHead>Verb examples / description</TableHead>
                            <TableHead className='w-1' />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {levels.map((lvl, idx) => (
                            <TableRow key={idx}>
                              <TableCell>
                                <Input
                                  value={lvl.code}
                                  onChange={(e) => updateLevel(idx, { code: e.target.value })}
                                  placeholder='K1'
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={lvl.name}
                                  onChange={(e) => updateLevel(idx, { name: e.target.value })}
                                  placeholder='Remember'
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={lvl.verb_examples}
                                  onChange={(e) => updateLevel(idx, { verb_examples: e.target.value })}
                                  placeholder='define, list, recall'
                                />
                              </TableCell>
                              <TableCell>
                                <Button
                                  type='button'
                                  variant='ghost'
                                  size='sm'
                                  disabled={levels.length <= 1}
                                  onClick={() => removeLevel(idx)}
                                >
                                  <Trash2 className='h-4 w-4' />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  <div className='flex justify-end gap-2'>
                    <Button type='button' variant='outline' onClick={() => router.back()}>
                      Cancel
                    </Button>
                    <Button type='submit' disabled={createMutation.isPending}>
                      {createMutation.isPending && (
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      )}
                      Create taxonomy
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* ── Reference table ───────────────────────────────────────────────── */}
          <div className='lg:col-span-1'>
            <div className='sticky top-6'>
              <ExistingTaxonomiesReference />
            </div>
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}

// ── Existing Taxonomies Reference Panel ────────────────────────────────────────

function ExistingTaxonomiesReference() {
  const { data, isLoading } = useBosTaxonomies({ sortBy: 'name', sortOrder: 'asc', limit: 50 });
  const rows = data?.data ?? [];

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-sm font-semibold'>Existing Taxonomies</CardTitle>
        <CardDescription className='text-xs'>
          Reference — existing frameworks in your institution.
        </CardDescription>
      </CardHeader>
      <CardContent className='p-0'>
        {isLoading ? (
          <div className='space-y-2 p-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-8 w-full' />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className='px-4 pb-4 text-xs text-muted-foreground'>No taxonomies found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='text-xs'>Name</TableHead>
                <TableHead className='text-xs'>Code</TableHead>
                <TableHead className='text-center text-xs'>Lvls</TableHead>
                <TableHead className='text-xs'>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className='text-xs'>
                  <TableCell className='font-medium'>{row.name}</TableCell>
                  <TableCell>
                    <code className='rounded bg-muted px-1 py-0.5 text-[10px]'>{row.code}</code>
                  </TableCell>
                  <TableCell className='text-center'>{row.level_count}</TableCell>
                  <TableCell>
                    <Badge variant={row.is_hierarchical ? 'default' : 'secondary'} className='text-[10px] px-1.5'>
                      {row.is_hierarchical ? 'H' : 'NH'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
