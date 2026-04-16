'use client';

import { useEffect, useState } from 'react';
import { CustomRole } from '@/types/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Copy } from 'lucide-react';

interface CloneRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceRole: CustomRole | null;
  onSubmit: (newRole: {
    role_key: string;
    role_name: string;
    description: string;
    permissions: Record<string, boolean>;
    institution_scope: 'all' | 'own';
  }) => Promise<void>;
}

export function CloneRoleDialog({
  open,
  onOpenChange,
  sourceRole,
  onSubmit,
}: CloneRoleDialogProps) {
  const [roleKey, setRoleKey] = useState('');
  const [roleName, setRoleName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sourceRole && open) {
      setRoleKey(`${sourceRole.role_key}_copy`);
      setRoleName(`${sourceRole.role_name} (Copy)`);
      setDescription(sourceRole.description || '');
      setError(null);
    }
  }, [sourceRole, open]);

  const permissionCount = sourceRole
    ? Object.values(sourceRole.permissions).filter(Boolean).length
    : 0;

  const handleSubmit = async () => {
    if (!sourceRole) return;
    const trimmedKey = roleKey.trim();
    const trimmedName = roleName.trim();

    if (!/^[a-z0-9_]+$/.test(trimmedKey)) {
      setError('Role key must be lowercase letters, numbers, and underscores only.');
      return;
    }
    if (!trimmedName) {
      setError('Role name is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onSubmit({
        role_key: trimmedKey,
        role_name: trimmedName,
        description: description.trim(),
        permissions: { ...sourceRole.permissions },
        institution_scope: sourceRole.institution_scope,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone role');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Clone Role
          </DialogTitle>
          <DialogDescription>
            Create a new role with the same permissions, scope, and description as
            the source role. You can edit any of these afterwards.
          </DialogDescription>
        </DialogHeader>

        {sourceRole && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Source role</span>
              <span className="font-medium">{sourceRole.role_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Permissions carried over</span>
              <Badge variant="secondary">{permissionCount}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Scope</span>
              <Badge variant="outline">
                {sourceRole.institution_scope === 'all'
                  ? 'All Institutions'
                  : 'Own Institution'}
              </Badge>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="clone-role-key">
              Role Key <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clone-role-key"
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
              placeholder="lowercase_snake_case"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and underscores only. Must be unique.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="clone-role-name">
              Role Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clone-role-name"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="Display name"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="clone-role-description">Description</Label>
            <Textarea
              id="clone-role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional description"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !sourceRole}>
            {submitting ? 'Cloning...' : 'Clone Role'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
