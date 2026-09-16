'use client';

// Label a shipped feature, from the page that measures it.
//
// The loop can only measure what has been labelled, and a label nobody can add
// without a migration is a label nobody adds. So this is deliberately a plain
// inline form: the feature key, what it is called, the ONE action that means it
// was used, who it is for, and where it came from.
//
// The key is the only awkward field, and it has to be: it is what a server
// route passes to fn_feature_used when the action happens, so it must match
// there exactly. Everything else is prose.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const EMPTY = {
  feature_key: '',
  title: '',
  core_action: '',
  intended_roles: 'all',
  module: '',
  source_pr: '',
};

export function RegisterFeatureForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const busy = saving || isPending;

  function set(field: keyof typeof EMPTY, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      // "all" (or an empty box) means every signed-in person — the same default
      // the database uses.
      const roles = form.intended_roles
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean);

      const pr = Number.parseInt(form.source_pr, 10);

      const response = await fetch('/api/admin/adoption/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          feature_key: form.feature_key.trim(),
          title: form.title.trim(),
          core_action: form.core_action.trim(),
          intended_roles: roles.length > 0 ? roles : ['all'],
          module: form.module.trim() || null,
          source_pr: Number.isFinite(pr) ? pr : null,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'The label could not be saved.');
      }

      toast.success(`${form.title.trim()} is labelled. It will be measured from now on.`);
      setForm(EMPTY);
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The label could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-border bg-card p-4 shadow-sm dark:shadow-none"
    >
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-foreground">Label a feature</h2>
        <p className="text-sm text-muted-foreground">
          Nothing is measured until it is labelled. Re-labelling an existing key updates it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="adoption-feature-key">Feature key</Label>
          <Input
            id="adoption-feature-key"
            value={form.feature_key}
            onChange={(event) => set('feature_key', event.target.value)}
            placeholder="gate.pass_issue"
            required
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Lower case, dots between parts. Must match what the code records.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adoption-title">What it is called</Label>
          <Input
            id="adoption-title"
            value={form.title}
            onChange={(event) => set('title', event.target.value)}
            placeholder="Gate pass"
            required
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adoption-core-action">Core action</Label>
          <Input
            id="adoption-core-action"
            value={form.core_action}
            onChange={(event) => set('core_action', event.target.value)}
            placeholder="issue a gate pass"
            required
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            The ONE thing that means the feature was used.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adoption-roles">For whom</Label>
          <Input
            id="adoption-roles"
            value={form.intended_roles}
            onChange={(event) => set('intended_roles', event.target.value)}
            placeholder="all"
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Role keys, comma separated. &ldquo;all&rdquo; means everyone signed in.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adoption-module">Module</Label>
          <Input
            id="adoption-module"
            value={form.module}
            onChange={(event) => set('module', event.target.value)}
            placeholder="gate"
            disabled={busy}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adoption-pr">Pull request number</Label>
          <Input
            id="adoption-pr"
            value={form.source_pr}
            onChange={(event) => set('source_pr', event.target.value)}
            placeholder="3842"
            inputMode="numeric"
            disabled={busy}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button type="submit" size="sm" disabled={busy}>
          {saving ? 'Saving…' : 'Label it'}
        </Button>
      </div>
    </form>
  );
}
