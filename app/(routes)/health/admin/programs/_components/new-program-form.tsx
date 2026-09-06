'use client';

// app/(routes)/health/admin/programs/_components/new-program-form.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// "New program" create form. On success navigates to the program editor so
// the manager can immediately add the 7 days. Mirrors the cycle-edit-form
// field pattern; restyled to the health aesthetic.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateProgram } from '@/hooks/health/use-wellness-programs';
import type {
  HealthProgramAudience,
  HealthProgramStatus,
} from '@/types/health-programs';

interface NewProgramFormProps {
  onCreated?: () => void;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function NewProgramForm({ onCreated }: NewProgramFormProps) {
  const router = useRouter();
  const create = useCreateProgram();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [theme, setTheme] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<HealthProgramStatus>('draft');
  const [audience, setAudience] = useState<HealthProgramAudience>('students');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value));
  };

  const canSave = title.trim().length >= 3 && slug.trim().length >= 3;

  const handleSubmit = async () => {
    if (!canSave) {
      toast.error('Title and slug are required (min 3 characters).');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      toast.error('End date cannot be before the start date.');
      return;
    }

    try {
      const program = await create.mutateAsync({
        title: title.trim(),
        slug: slug.trim(),
        theme: theme.trim() || null,
        description: description.trim() || null,
        status,
        audience,
        start_date: startDate || null,
        end_date: endDate || null,
      });
      onCreated?.();
      router.push(`/health/admin/programs/${program.id}`);
    } catch (err) {
      // The hook surfaces a toast on error; this guards the navigation path.
      toast.error(err instanceof Error ? err.message : 'Could not create program');
    }
  };

  return (
    <Card className="border-emerald-200">
      <CardHeader>
        <CardTitle className="text-base text-slate-800">New program</CardTitle>
        <CardDescription>
          Start with the basics. You&apos;ll add the daily videos and quizzes on
          the next screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-title">Title</Label>
            <Input
              id="np-title"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="e.g. 7-Day Better Sleep Challenge"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-slug">Slug</Label>
            <Input
              id="np-slug"
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="7-day-better-sleep"
            />
            <p className="text-xs text-slate-400">
              Used in the program&apos;s web address. Lowercase, dashes only.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="np-theme">Theme (optional)</Label>
          <Input
            id="np-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder="e.g. Sleep, Hydration, Mindfulness"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="np-description">Description (optional)</Label>
          <Textarea
            id="np-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One or two lines participants see before they start."
            rows={2}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-status">Status</Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as HealthProgramStatus)}
            >
              <SelectTrigger id="np-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft — not visible yet</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="active">Active — live now</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-audience">Audience</Label>
            <Select
              value={audience}
              onValueChange={(v) => setAudience(v as HealthProgramAudience)}
            >
              <SelectTrigger id="np-audience">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="students">Students</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="both">Students & staff</SelectItem>
                <SelectItem value="public">Public</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-start">Start date (optional)</Label>
            <Input
              id="np-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-end">End date (optional)</Label>
            <Input
              id="np-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!canSave || create.isPending}
            className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {create.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Create program
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
