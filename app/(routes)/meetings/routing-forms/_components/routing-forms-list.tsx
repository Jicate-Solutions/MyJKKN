'use client';

// app/(routes)/meetings/routing-forms/_components/routing-forms-list.tsx
//
// Client list + "New form" creator for the Routing Forms admin (M1).
// Creates a form via the createRoutingForm server action, then navigates to the
// builder. Slug is auto-derived from the title but editable.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink, Loader2, Plus, Trash2, Workflow } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createRoutingForm, deleteRoutingForm } from '../actions';
import type { RoutingForm } from '@/lib/services/meetings/routing-form-service';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

export function RoutingFormsList({ initialForms }: { initialForms: RoutingForm[] }) {
  const router = useRouter();
  const [forms, setForms] = useState<RoutingForm[]>(initialForms);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!title.trim()) {
      toast.error('Please enter a title.');
      return;
    }
    setSaving(true);
    const res = await createRoutingForm({ title: title.trim(), slug: slug || slugify(title) });
    setSaving(false);
    if (!res.success || !res.data) {
      toast.error(res.error ?? 'Could not create the form.');
      return;
    }
    toast.success('Routing form created.');
    setOpen(false);
    router.push(`/meetings/routing-forms/${res.data.id}`);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this routing form? This cannot be undone.')) return;
    const res = await deleteRoutingForm(id);
    if (!res.success) {
      toast.error(res.error ?? 'Could not delete the form.');
      return;
    }
    setForms((f) => f.filter((x) => x.id !== id));
    toast.success('Routing form deleted.');
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" /> New routing form
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New routing form</DialogTitle>
              <DialogDescription>
                Give it a name. You&apos;ll add the questions and routing rules next.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="rf-title">Title</Label>
                <Input
                  id="rf-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
                  placeholder="e.g. Talk to admissions"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rf-slug">Public URL slug</Label>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="shrink-0">/r/</span>
                  <Input
                    id="rf-slug"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(slugify(e.target.value));
                    }}
                    placeholder="talk-to-admissions"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Workflow className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <h3 className="text-sm font-medium">No routing forms yet</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                Create a form that asks a few questions and sends each visitor to the
                right scheduling link, page, or message.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {forms.map((form) => (
            <Card key={form.id} className="group relative">
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <Link href={`/meetings/routing-forms/${form.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">{form.title}</h3>
                    {form.is_active ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Off
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">/r/{form.slug}</p>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={`/r/${form.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open public form"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleDelete(form.id)}
                    title="Delete"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
