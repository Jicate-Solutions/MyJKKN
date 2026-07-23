'use client';

// app/(routes)/bos/sop/new/page.tsx
//
// Creation flow: pick a template (or start blank), fill in metadata, submit.
// On success the user is redirected straight into the editor at /bos/sop/[id]/edit.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ArrowLeft } from 'lucide-react';

import { useAuth } from '@/hooks/use-auth';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';

import { useCreateBosSopDocument } from '@/hooks/bos/use-bos-sop';
import {
  SOP_CATEGORIES, SOP_CATEGORY_LABELS,
  SOP_LANGUAGES, SOP_LANGUAGE_LABELS,
  type SopCategory, type SopLanguage,
} from '@/types/bos-sop';
import { listSopTemplates } from '@/lib/sop/templates';

export default function NewSopPage() {
  const router = useRouter();
  const create = useCreateBosSopDocument();
  const { profile } = useAuth();

  const [templateId, setTemplateId] = useState<string>('blank');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SopCategory>('syllabus_framing');
  const [language, setLanguage] = useState<SopLanguage>('en');
  const [description, setDescription] = useState('');

  const templates = listSopTemplates();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    try {
      const created = await create.mutateAsync({
        title: title.trim(),
        category,
        language,
        description: description.trim() || null,
        template_id: templateId || undefined,
        institutions_id: profile?.institution_id ?? undefined,
      });
      toast.success('SOP document created');
      router.push(`/bos/sop/${created.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    }
  };

  return (
    <div className='space-y-4'>
      <Button variant='ghost' size='sm' onClick={() => router.push('/bos/sop')} className='gap-1'>
        <ArrowLeft className='h-4 w-4' /> Back to SOP list
      </Button>

      <form onSubmit={handleSubmit} className='grid gap-4 md:grid-cols-3'>
        {/* ── Template picker ─────────────────────────────────────────── */}
        <Card className='md:col-span-2'>
          <CardHeader>
            <CardTitle className='text-base'>Choose a starting template</CardTitle>
          </CardHeader>
          <CardContent className='grid sm:grid-cols-2 gap-3'>
            {templates.map((t) => (
              <button
                key={t.id}
                type='button'
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  'rounded-md border p-3 text-left hover:border-primary transition-colors',
                  templateId === t.id && 'border-primary ring-1 ring-primary'
                )}
              >
                <div className='flex items-start gap-2'>
                  <FileText className='h-5 w-5 text-muted-foreground shrink-0 mt-0.5' />
                  <div className='flex-1 min-w-0'>
                    <div className='font-medium text-sm'>{t.name}</div>
                    <p className='text-xs text-muted-foreground line-clamp-2'>{t.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        {/* ── Metadata ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Document details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='space-y-1'>
              <Label htmlFor='title'>Title *</Label>
              <Input
                id='title'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. Framing of Syllabus — UG Arts'
                required
              />
            </div>

            <div className='space-y-1'>
              <Label htmlFor='category'>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as SopCategory)}>
                <SelectTrigger id='category'><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOP_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{SOP_CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1'>
              <Label htmlFor='language'>Language</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as SopLanguage)}>
                <SelectTrigger id='language'><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOP_LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>{SOP_LANGUAGE_LABELS[l]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className='space-y-1'>
              <Label htmlFor='description'>Description</Label>
              <Textarea
                id='description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='Short summary shown in lists and cards'
                className='min-h-[80px]'
              />
            </div>

            <Button type='submit' className='w-full' disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create & open editor'}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
