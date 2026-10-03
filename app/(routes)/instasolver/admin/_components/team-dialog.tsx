'use client';

// Create / edit a maintenance team. Teams are deactivated, never deleted.

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCategories, useInstaSolverMutation, useInstitutions } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverReferenceService } from '@/lib/services/instasolver/reference-service';
import type { MaintenanceTeam, SaveTeamDto } from '@/types/instasolver';

const NONE = 'none';

interface FormState {
  name: string;
  description: string;
  institution: string;
  category: string;
  email: string;
  is_active: boolean;
}

const EMPTY: FormState = { name: '', description: '', institution: NONE, category: NONE, email: '', is_active: true };

type TeamDialogProps = {
  team: MaintenanceTeam | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Remounts per open / team, so the form starts from the row each time. */
export function TeamDialog(props: TeamDialogProps) {
  return <TeamDialogInner key={`${props.team?.id ?? 'new'}-${props.open}`} {...props} />;
}

function TeamDialogInner({ team, open, onOpenChange }: TeamDialogProps) {
  const [form, setForm] = useState<FormState>(() =>
    team
      ? {
          name: team.name,
          description: team.description ?? '',
          institution: team.institution_id ?? NONE,
          category: team.category_id ? String(team.category_id) : NONE,
          email: team.email ?? '',
          is_active: team.is_active
        }
      : EMPTY
  );
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email', string>>>({});
  const { data: institutions } = useInstitutions();
  const { data: categories } = useCategories('issue', false);

  const save = useInstaSolverMutation(
    (dto: SaveTeamDto) => InstaSolverReferenceService.saveTeam(dto, team?.id),
    team ? 'Team updated' : 'Team created'
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = 'Give the team a name (at least 2 characters)';
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address';
    setErrors(next);
    if (Object.keys(next).length) return;

    save.mutate(
      {
        name: form.name,
        description: form.description.trim() || null,
        institution_id: form.institution === NONE ? null : form.institution,
        category_id: form.category === NONE ? null : Number(form.category),
        email: form.email.trim() || null,
        is_active: form.is_active
      },
      { onSuccess: () => onOpenChange(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{team ? `Edit ${team.name}` : 'New maintenance team'}</DialogTitle>
          <DialogDescription>
            Being on a team is what makes someone a maintenance team member in InstaSolver.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="team-name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              aria-invalid={!!errors.name}
              maxLength={80}
            />
            {errors.name && (
              <p className="text-sm text-destructive" role="alert">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-institution">Institution</Label>
              <Select value={form.institution} onValueChange={(v) => set('institution', v)}>
                <SelectTrigger id="team-institution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>All institutions</SelectItem>
                  {institutions?.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="team-category">Category</Label>
              <Select value={form.category} onValueChange={(v) => set('category', v)}>
                <SelectTrigger id="team-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not tied to a category</SelectItem>
                  {categories?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                      {!c.is_active && ' (inactive)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The category this team covers.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="team-email">Team email</Label>
            <Input
              id="team-email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-destructive" role="alert">
                {errors.email}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="team-active">Active</Label>
              <p className="text-xs text-muted-foreground">
                An inactive team is not offered for assignment. Its history stays.
              </p>
            </div>
            <Switch id="team-active" checked={form.is_active} onCheckedChange={(v) => set('is_active', v)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : team ? 'Save changes' : 'Create team'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
