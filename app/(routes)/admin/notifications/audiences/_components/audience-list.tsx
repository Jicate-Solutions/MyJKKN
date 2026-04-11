'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  GraduationCap,
  UserCog,
  Briefcase,
  Home,
  Bus,
  AlertTriangle,
  Megaphone,
  Shield,
  Eye,
  Trash2,
  Plus,
  Search,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';

// --- Types ---------------------------------------------------------------

// NOTE: wire types match the API contract; see types/notifications.ts for the
// authoritative shared definitions. These local interfaces are intentionally
// scoped to this component.
interface Audience {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  query_type?: 'built_in' | 'sql';
  query_params?: { name?: string; sql?: string };
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface AudiencesResponse {
  audiences?: Audience[];
  data?: Audience[];
}

interface PreviewUser {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  institution_name?: string | null;
}

interface PreviewResponse {
  audience_id?: string;
  name?: string;
  count?: number;
  preview_users?: PreviewUser[];
}

// --- Icon registry -------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Users,
  GraduationCap,
  UserCog,
  Briefcase,
  Home,
  Bus,
  AlertTriangle,
  Megaphone,
  Shield
};

function getIcon(name?: string | null) {
  if (!name) return Users;
  const Icon = ICON_MAP[name];
  if (!Icon) {
    // Surface unknown icon names in dev so typos don't silently fall back.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[audience-list] Unknown icon name "${name}"; falling back to Users. Add to ICON_MAP or update backend whitelist.`
      );
    }
    return Users;
  }
  return Icon;
}

// --- API helpers ---------------------------------------------------------

async function fetchAudiences(): Promise<Audience[]> {
  const res = await fetch('/api/admin/notifications/audiences', {
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error('Failed to load audiences');
  }
  const body: AudiencesResponse = await res.json();
  return body.audiences ?? body.data ?? [];
}

async function fetchAudiencePreview(id: string): Promise<PreviewResponse> {
  const res = await fetch(`/api/admin/notifications/audiences/${id}/preview`, {
    cache: 'no-store'
  });
  if (!res.ok) {
    throw new Error('Failed to load audience preview');
  }
  return res.json();
}

async function deleteAudience(id: string): Promise<void> {
  const res = await fetch(`/api/admin/notifications/audiences/${id}`, {
    method: 'DELETE',
    cache: 'no-store'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to delete audience');
  }
}

// --- Main component ------------------------------------------------------

export function AudienceList() {
  const queryClient = useQueryClient();
  const { isSuperAdmin } = usePermissions();
  const [search, setSearch] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const {
    data: audiences = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['notification-audiences'],
    queryFn: fetchAudiences,
    // Audiences are admin-managed config that rarely change; polling every 30s
    // burns network + battery on mobile. Rely on explicit invalidation after
    // mutations (see deleteMutation.onSuccess) plus a long staleTime instead.
    staleTime: 5 * 60 * 1000
  });

  const previewQuery = useQuery({
    queryKey: ['notification-audience-preview', previewId],
    queryFn: () => {
      if (!previewId) throw new Error('Audience id missing');
      return fetchAudiencePreview(previewId);
    },
    enabled: !!previewId
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAudience,
    onSuccess: () => {
      toast.success('Audience deleted');
      queryClient.invalidateQueries({ queryKey: ['notification-audiences'] });
      setDeleteId(null);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete audience');
    }
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return audiences;
    return audiences.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description ?? '').toLowerCase().includes(q)
    );
  }, [audiences, search]);

  const previewAudience = useMemo(
    () => audiences.find((a) => a.id === previewId) || null,
    [audiences, previewId]
  );
  const audienceToDelete = useMemo(
    () => audiences.find((a) => a.id === deleteId) || null,
    [audiences, deleteId]
  );

  return (
    <div className='space-y-4 sm:space-y-6'>
      <div className='flex-1 space-y-4 px-0 sm:p-4 pt-4 sm:pt-6'>
        {/* Header */}
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
          <div>
            <h2 className='text-2xl sm:text-3xl font-bold tracking-tight'>
              Audiences
            </h2>
            <p className='text-sm text-muted-foreground'>
              Manage saved audiences for targeted notifications
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Link href='/admin/notifications/audiences/new'>
              <Button size='sm' className='h-9'>
                <Plus className='h-4 w-4 sm:mr-2' />
                <span className='hidden sm:inline'>Create Audience</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className='relative max-w-md'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder='Search audiences by name or description'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='pl-9'
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <AudienceListSkeleton />
        ) : isError ? (
          <div className='text-center py-10 space-y-3'>
            <p className='text-destructive text-sm'>
              {(error as Error)?.message || 'Failed to load audiences'}
            </p>
            <Button variant='outline' size='sm' onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasSearch={!!search.trim()} />
        ) : (
          <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'>
            {filtered.map((audience) => {
              const Icon = getIcon(audience.icon);
              return (
                <Card
                  key={audience.id}
                  className={cn(
                    'relative flex flex-col transition-shadow hover:shadow-md'
                  )}
                >
                  <CardHeader className='pb-3'>
                    <div className='flex items-start justify-between gap-3'>
                      <div className='flex items-center gap-3 min-w-0'>
                        <div className='h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0'>
                          <Icon className='h-5 w-5 text-primary' />
                        </div>
                        <div className='min-w-0'>
                          <CardTitle className='text-base truncate'>
                            {audience.name}
                          </CardTitle>
                          {audience.query_type && (
                            <p className='text-xs text-muted-foreground mt-0.5 truncate'>
                              {audience.query_type === 'built_in'
                                ? 'Built-in query'
                                : 'Custom SQL'}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={audience.is_active ? 'default' : 'secondary'}
                        className='shrink-0'
                      >
                        {audience.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className='flex-1 pb-3'>
                    {/* min-h must match line-clamp-3 * line-height (1.5rem) = 4.5rem
                        so cards in the grid have consistent height regardless of
                        how much description text is actually present. */}
                    <CardDescription className='line-clamp-3 min-h-[4.5rem]'>
                      {audience.description || 'No description provided.'}
                    </CardDescription>
                  </CardContent>
                  <CardFooter className='flex items-center justify-between gap-2 pt-0'>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => setPreviewId(audience.id)}
                      className='flex-1'
                    >
                      <Eye className='h-4 w-4 mr-2' />
                      Preview
                    </Button>
                    {isSuperAdmin && (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={() => setDeleteId(audience.id)}
                        className='text-destructive hover:text-destructive'
                        aria-label={`Delete ${audience.name}`}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <Dialog
        open={!!previewId}
        onOpenChange={(open) => {
          if (!open) setPreviewId(null);
        }}
      >
        <DialogContent className='max-w-lg'>
          <DialogHeader>
            <DialogTitle>
              {previewAudience?.name ?? 'Audience preview'}
            </DialogTitle>
            <DialogDescription>
              {previewAudience?.description ||
                'First 20 users who match this audience'}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            {previewQuery.isLoading ? (
              <div className='flex items-center justify-center py-8 text-muted-foreground text-sm'>
                <Loader2 className='h-4 w-4 animate-spin mr-2' />
                Loading preview...
              </div>
            ) : previewQuery.isError ? (
              <p className='text-destructive text-sm py-4 text-center'>
                {(previewQuery.error as Error)?.message ||
                  'Failed to load preview'}
              </p>
            ) : previewQuery.data ? (
              <>
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary'>
                    {/* Authoritative shape: API returns { count, preview_users }.
                        The total count is always `count`; preview_users is the
                        first 20 rows only. */}
                    {previewQuery.data.count ?? 0} users
                  </Badge>
                  <span className='text-xs text-muted-foreground'>
                    Showing first 20
                  </span>
                </div>
                <div className='max-h-80 overflow-y-auto border rounded-md divide-y'>
                  {(previewQuery.data.preview_users || [])
                    .slice(0, 20)
                    .map((u, idx) => (
                      <div
                        key={u.id || idx}
                        className='px-3 py-2 text-sm flex items-center justify-between gap-2'
                      >
                        <div className='min-w-0'>
                          <p className='font-medium truncate'>
                            {u.full_name || u.email || u.id}
                          </p>
                          {u.email && (
                            <p className='text-xs text-muted-foreground truncate'>
                              {u.email}
                            </p>
                          )}
                        </div>
                        {u.role && (
                          <Badge variant='outline' className='text-xs shrink-0'>
                            {u.role}
                          </Badge>
                        )}
                      </div>
                    ))}
                  {(previewQuery.data.preview_users || []).length === 0 && (
                    <p className='px-3 py-6 text-sm text-center text-muted-foreground'>
                      No users match this audience.
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => setPreviewId(null)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteId}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteId(null);
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Delete audience?</DialogTitle>
            <DialogDescription>
              {audienceToDelete
                ? `"${audienceToDelete.name}" will be soft-deleted and removed from the list. This action can be reversed by a database admin.`
                : 'This audience will be soft-deleted.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type='button'
              variant='destructive'
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className='h-4 w-4 mr-2' />
                  Delete audience
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Sub-components ------------------------------------------------------

function AudienceListSkeleton() {
  return (
    <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className='flex flex-col'>
          <CardHeader className='pb-3'>
            <div className='flex items-center gap-3'>
              <Skeleton className='h-10 w-10 rounded-lg' />
              <div className='flex-1 space-y-2'>
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-3 w-1/2' />
              </div>
            </div>
          </CardHeader>
          <CardContent className='flex-1 pb-3'>
            <Skeleton className='h-3 w-full mb-2' />
            <Skeleton className='h-3 w-5/6' />
          </CardContent>
          <CardFooter className='pt-0'>
            <Skeleton className='h-9 w-full' />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className='border border-dashed rounded-lg py-12 px-4 text-center space-y-3'>
      <div className='mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center'>
        <Users className='h-6 w-6 text-muted-foreground' />
      </div>
      <div>
        <p className='font-medium'>
          {hasSearch ? 'No matching audiences' : 'No audiences yet'}
        </p>
        <p className='text-sm text-muted-foreground mt-1'>
          {hasSearch
            ? 'Try adjusting your search.'
            : 'Create one to get started.'}
        </p>
      </div>
      {!hasSearch && (
        <Link href='/admin/notifications/audiences/new'>
          <Button size='sm' className='mt-2'>
            <Plus className='h-4 w-4 mr-2' />
            Create Audience
          </Button>
        </Link>
      )}
    </div>
  );
}
