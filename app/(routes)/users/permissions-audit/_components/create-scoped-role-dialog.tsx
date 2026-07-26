'use client';

import { useState, useEffect } from 'react';
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
import { Loader2, Sparkles } from 'lucide-react';

/**
 * Create a dedicated role that grants ONLY the scoped action's permission key(s),
 * then hand the new role back so the caller can immediately assign a user to it.
 * This is the correct way to grant scoped access (e.g. "ID Cards → Manage" and
 * nothing else) in a role-based system — instead of over-granting a broad
 * existing role or super_admin.
 */
export function CreateScopedRoleDialog({
  open,
  onOpenChange,
  moduleLabel,
  actionLabel,
  permKeys,
  onCreated
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  moduleLabel: string;
  actionLabel: string;
  permKeys: string[];
  onCreated?: (role: { roleKey: string; roleName: string }) => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const verb = actionLabel
        ? actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)
        : '';
      setName(`${moduleLabel} ${verb}`.trim());
      setSubmitting(false);
    }
  }, [open, moduleLabel, actionLabel]);

  const create = async () => {
    const roleName = name.trim();
    if (!roleName || permKeys.length === 0) return;
    setSubmitting(true);
    try {
      const r = await fetch('/api/users/roles/create-scoped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleName, permKeys })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Failed to create role');
      toast.success(`Created role "${j.roleName}" — now assign a user`);
      onCreated?.({ roleKey: j.roleKey, roleName: j.roleName });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create role');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Create a scoped role</DialogTitle>
          <DialogDescription>
            A new role that grants{' '}
            <span className='font-medium text-foreground'>only</span> {moduleLabel} ›{' '}
            {actionLabel} — nothing else. You can assign it to a user next.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-3'>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium'>Role name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='e.g. ID Card Manager'
              autoFocus
            />
          </div>
          <div className='rounded-md border p-2.5'>
            <div className='text-[11px] font-medium text-muted-foreground mb-1'>
              Grants exactly these permission{permKeys.length !== 1 ? 's' : ''}:
            </div>
            <div className='space-y-0.5 max-h-32 overflow-y-auto'>
              {permKeys.map((k) => (
                <div key={k} className='font-mono text-[10px] text-foreground/70'>
                  {k}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='ghost'
            size='sm'
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            size='sm'
            onClick={create}
            disabled={submitting || !name.trim()}
            className='gap-1'
          >
            {submitting ? (
              <Loader2 className='h-3.5 w-3.5 animate-spin' />
            ) : (
              <Sparkles className='h-3.5 w-3.5' />
            )}
            Create &amp; assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
