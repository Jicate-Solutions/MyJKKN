'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Search, ShieldAlert, Loader2, Check } from 'lucide-react';

interface UserResult {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  avatar_url: string | null;
}

function initialsOf(u: { full_name?: string | null; email?: string | null }): string {
  return (u.full_name || u.email || '?').slice(0, 2).toUpperCase();
}

/**
 * Assign a single user to one role, then notify them (in-app + web push).
 * Flow: search a user → confirm (platform-wide access warning) → POST
 * /api/users/roles/assign. The confirm step exists because a role grant is a
 * real, platform-wide access change.
 */
export function AssignUserDialog({
  open,
  onOpenChange,
  roleKey,
  roleName,
  onAssigned
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roleKey: string;
  roleName: string;
  onAssigned?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<UserResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset every time the dialog closes.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setPicked(null);
      setSubmitting(false);
    }
  }, [open]);

  // Debounced user search (reuses the permissions-audit search endpoint).
  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/users/permissions-audit/search?q=${encodeURIComponent(q)}`
        );
        const j = await r.json();
        if (!cancelled) setResults(Array.isArray(j.results) ? j.results : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, picked]);

  const assign = useCallback(async () => {
    if (!picked) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/users/roles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: picked.id, roleKey })
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 || j.alreadyAssigned) {
        toast(j.message || `${picked.full_name || 'User'} already has ${roleName}.`, {
          icon: 'ℹ️'
        });
        onOpenChange(false);
        return;
      }
      if (!r.ok) throw new Error(j.error || 'Failed to assign role');
      const pushed = typeof j.pushed === 'number' ? j.pushed : 0;
      toast.success(
        `Assigned ${roleName} to ${picked.full_name || picked.email}${
          pushed > 0 ? ' — push sent' : ' — notified'
        }`
      );
      onAssigned?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign role');
    } finally {
      setSubmitting(false);
    }
  }, [picked, roleKey, roleName, onAssigned, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Assign role: {roleName}</DialogTitle>
          <DialogDescription>
            Search for a user and grant them the{' '}
            <span className='font-medium text-foreground'>{roleName}</span> role.
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
          <div className='space-y-2'>
            <div className='relative'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
              <Input
                autoFocus
                placeholder='Search name or email…'
                className='pl-8'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className='max-h-64 overflow-y-auto rounded-md border divide-y'>
              {searching && (
                <div className='p-3 text-xs text-muted-foreground flex items-center gap-2'>
                  <Loader2 className='h-3 w-3 animate-spin' /> Searching…
                </div>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <div className='p-3 text-xs text-muted-foreground'>No users found.</div>
              )}
              {!searching && query.trim().length < 2 && (
                <div className='p-3 text-xs text-muted-foreground'>
                  Type at least 2 characters to search.
                </div>
              )}
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setPicked(u)}
                  className='w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 transition-colors'
                >
                  <Avatar className='h-7 w-7'>
                    {u.avatar_url ? <AvatarImage src={u.avatar_url} alt='' /> : null}
                    <AvatarFallback className='text-[10px]'>
                      {initialsOf(u)}
                    </AvatarFallback>
                  </Avatar>
                  <div className='min-w-0'>
                    <div className='text-sm font-medium truncate'>
                      {u.full_name || u.email}
                    </div>
                    <div className='text-xs text-muted-foreground truncate'>
                      {u.email}
                      {u.role ? ` · ${u.role}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className='space-y-3'>
            <div className='flex items-center gap-2 rounded-md border p-2.5'>
              <Avatar className='h-8 w-8'>
                {picked.avatar_url ? (
                  <AvatarImage src={picked.avatar_url} alt='' />
                ) : null}
                <AvatarFallback className='text-[10px]'>
                  {initialsOf(picked)}
                </AvatarFallback>
              </Avatar>
              <div className='min-w-0'>
                <div className='text-sm font-medium truncate'>
                  {picked.full_name || picked.email}
                </div>
                <div className='text-xs text-muted-foreground truncate'>
                  {picked.email}
                </div>
              </div>
            </div>
            <div className='flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
              <ShieldAlert className='h-4 w-4 shrink-0 mt-0.5' />
              <span>
                This grants <span className='font-semibold'>{roleName}</span> access
                across all of MyJKKN — not just this module. They&rsquo;ll be notified
                immediately.
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          {picked ? (
            <>
              <Button
                variant='ghost'
                size='sm'
                onClick={() => setPicked(null)}
                disabled={submitting}
              >
                Back
              </Button>
              <Button
                size='sm'
                onClick={assign}
                disabled={submitting}
                className='gap-1'
              >
                {submitting ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <Check className='h-3.5 w-3.5' />
                )}
                Grant {roleName}
              </Button>
            </>
          ) : (
            <Button variant='ghost' size='sm' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
