'use client';

/**
 * Tab 3 - Layer 2 Rules CRUD
 *
 * List view of quick_action_rules with edit/delete + "New Rule" button.
 * Slide-in editor (tab-rules-editor.tsx) handles create/update.
 *
 * Spec: specs/attention-bar-5-layer-system.md section 6 Tab 3.
 * Permission: attention_bar.rules.manage
 *
 * Wave 3 follow-on to PR #566 (Wave 2 admin shell).
 */

import { useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

import { TabRulesEditor, type AttentionBarRule } from './tab-rules-editor';

interface RulesResponse {
  rules: AttentionBarRule[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;

async function fetchRules(page: number): Promise<RulesResponse> {
  const res = await fetch(
    `/api/attention-bar/admin/rules?page=${page}&pageSize=${PAGE_SIZE}`,
    { cache: 'no-store' },
  );
  if (!res.ok) throw new Error('Failed to load rules');
  return res.json();
}

async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`/api/attention-bar/admin/rules/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Delete failed');
  }
}

export function TabRules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editingRule, setEditingRule] = useState<AttentionBarRule | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AttentionBarRule | null>(
    null,
  );

  const queryKey = ['attention-bar-rules', page] as const;

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchRules(page),
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (rule: AttentionBarRule) => deleteRule(rule.id),
    // Optimistic: remove the row from the current page.
    onMutate: async (rule) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<RulesResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<RulesResponse>(queryKey, {
          ...previous,
          rules: previous.rules.filter((r) => r.id !== rule.id),
          total: Math.max(0, previous.total - 1),
        });
      }
      return { previous };
    },
    onError: (err, _rule, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(queryKey, ctx.previous);
      }
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    },
    onSuccess: () => {
      toast({ title: 'Rule deleted' });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['attention-bar-rules'] });
    },
  });

  const filteredRules = useMemo(() => {
    if (!data?.rules) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.rules;
    return data.rules.filter(
      (r) =>
        r.rule_name.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.page.toLowerCase().includes(q) ||
        r.role.toLowerCase().includes(q),
    );
  }, [data?.rules, search]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function openNewEditor() {
    setEditingRule(null);
    setEditorOpen(true);
  }

  function openEditEditor(rule: AttentionBarRule) {
    setEditingRule(rule);
    setEditorOpen(true);
  }

  function handleEditorClose(saved: boolean) {
    setEditorOpen(false);
    setEditingRule(null);
    if (saved) {
      queryClient.invalidateQueries({ queryKey: ['attention-bar-rules'] });
    }
  }

  return (
    <div className='space-y-6 py-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <h3 className='text-lg font-semibold flex items-center gap-2'>
          <ListChecks className='h-5 w-5 text-amber-500' />
          Layer 2 Rules
        </h3>
        <div className='flex items-center gap-2'>
          <div className='relative'>
            <Search className='absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search by name, page, role'
              className='pl-8 w-64'
            />
          </div>
          <Button variant='ghost' size='sm' onClick={() => refetch()}>
            <RefreshCw
              className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button size='sm' onClick={openNewEditor}>
            <Plus className='h-4 w-4 mr-1' /> New Rule
          </Button>
        </div>
      </div>

      {error && (
        <Card className='border-destructive'>
          <CardContent className='pt-6'>
            <p className='text-destructive text-sm'>
              Failed to load rules. Check server logs.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>
            {data ? `${data.total} rule${data.total === 1 ? '' : 's'}` : '...'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='space-y-2'>
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className='h-12 bg-muted animate-pulse rounded'
                />
              ))}
            </div>
          ) : filteredRules.length === 0 ? (
            <p className='text-sm text-muted-foreground py-6 text-center'>
              {search
                ? 'No rules match the search.'
                : 'No rules defined yet. Click "New Rule" to create one.'}
            </p>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-1/4'>Name</TableHead>
                    <TableHead>Page</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className='text-right'>Priority</TableHead>
                    <TableHead className='text-center'>Active</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div className='font-medium text-sm'>
                          {rule.rule_name}
                        </div>
                        {rule.description && (
                          <div className='text-xs text-muted-foreground line-clamp-1'>
                            {rule.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className='font-mono text-xs'>
                        {rule.page}
                      </TableCell>
                      <TableCell className='text-xs'>{rule.role}</TableCell>
                      <TableCell className='text-right text-sm'>
                        {rule.priority}
                      </TableCell>
                      <TableCell className='text-center'>
                        {rule.is_active ? (
                          <Badge variant='default' className='bg-green-500'>
                            On
                          </Badge>
                        ) : (
                          <Badge variant='secondary'>Off</Badge>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <div className='flex items-center justify-end gap-1'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => openEditEditor(rule)}
                          >
                            <Pencil className='h-4 w-4' />
                          </Button>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => setPendingDelete(rule)}
                          >
                            <Trash2 className='h-4 w-4 text-destructive' />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data && totalPages > 1 && (
            <div className='flex items-center justify-between pt-4 border-t mt-4'>
              <p className='text-xs text-muted-foreground'>
                Page {page} of {totalPages}
              </p>
              <div className='flex items-center gap-1'>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className='h-4 w-4' />
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className='h-4 w-4' />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TabRulesEditor
        open={editorOpen}
        rule={editingRule}
        onClose={handleEditorClose}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this rule?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  Rule <strong>{pendingDelete.rule_name}</strong> will be removed
                  permanently. Layer 2 will fall through to Layer 3 / Layer 1 for
                  matching pages.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) {
                  deleteMutation.mutate(pendingDelete);
                  setPendingDelete(null);
                }
              }}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
