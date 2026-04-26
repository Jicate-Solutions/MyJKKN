'use client';

// Smoke-test form for the General Events Module.
// Phase-1A production schema is live (events + events_general_categories + 5 new tables + 6 triggers).
// This page writes ONE event directly via browser Supabase client to validate the full schema
// end-to-end with real user input. Deliberately minimal — no approval chain wiring yet, no
// bundles/roles/sessions/waitlist UI. If this works with real traffic, Phase 1B earns its scope.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'react-hot-toast';

type Category = { id: string; name: string; slug: string };

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export default function ProposeEventPage() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [venueText, setVenueText] = useState('');
  const [scope, setScope] = useState<'chapter' | 'institution' | 'all_jkkn'>('institution');
  const [visibility, setVisibility] = useState<'public' | 'all_jkkn' | 'institution' | 'invited'>('institution');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('events_general_categories' as any)
        .select('id, name, slug')
        .eq('is_active', true)
        .order('priority_order');
      if (error) toast.error(`Categories load failed: ${error.message}`);
      else setCategories(((data ?? []) as unknown) as Category[]);
      setLoadingCats(false);
    })();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !categoryId || !startAt || !endAt || !venueText) {
      toast.error('Fill all required fields');
      return;
    }
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Sign in first'); setSubmitting(false); return; }

    const { data: profile } = await supabase.from('profiles').select('institution_id').eq('id', user.id).single();
    if (!profile?.institution_id) { toast.error('Your profile has no institution'); setSubmitting(false); return; }

    const cat = categories.find(c => c.id === categoryId);
    const year = new Date(startAt).getFullYear();
    const slug = `${slugify(name)}-${year}`;

    const { data, error } = await (supabase as any).from('events').insert({
      institution_id: profile.institution_id,
      event_type: cat?.slug ?? 'general',
      name,
      slug,
      description: description || null,
      event_category_id: categoryId,
      status: 'draft',
      scope,
      visibility,
      iqac_evidence_status: 'draft',
      naac_criteria: [],
      venue_text: venueText,
      start_date: new Date(startAt).toISOString(),
      end_date: new Date(endAt).toISOString(),
      year,
      is_active: true,
      is_public: false,
      proposed_by: user.id,
      created_by: user.id,
      config: {},
      registration_config: {},
      route_config: {},
      branding_config: {},
    }).select('id, slug').single();

    setSubmitting(false);
    if (error) { toast.error(`Submit failed: ${error.message}`); return; }
    toast.success(`Event proposed — id ${data.id.slice(0, 8)}…`);
    router.push(`/events/propose?created=${data.slug}`);
  };

  return (
    <ContentLayout title="Propose Event">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/">Home</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/events">Events</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Propose</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="max-w-2xl">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/events"><ArrowLeft className="mr-1 h-4 w-4" />Back</Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Propose a new event</CardTitle>
            <p className="text-sm text-muted-foreground">
              Smoke-test form — writes directly to the live schema. Status starts as <code>draft</code>.
              Approval workflow not wired yet; Phase 1B will add it.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Event name *</Label>
                <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Annual Cultural Day 2026" required />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category">Category *</Label>
                <Select value={categoryId} onValueChange={setCategoryId} disabled={loadingCats}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder={loadingCats ? 'Loading…' : 'Select category'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="start">Start *</Label>
                  <Input id="start" type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end">End *</Label>
                  <Input id="end" type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} required />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="venue">Venue *</Label>
                <Input id="venue" value={venueText} onChange={e => setVenueText(e.target.value)} placeholder="e.g., Main Auditorium" required />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="scope">Scope</Label>
                  <Select value={scope} onValueChange={v => setScope(v as typeof scope)}>
                    <SelectTrigger id="scope"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chapter">Chapter</SelectItem>
                      <SelectItem value="institution">Institution</SelectItem>
                      <SelectItem value="all_jkkn">All JKKN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="visibility">Visibility</Label>
                  <Select value={visibility} onValueChange={v => setVisibility(v as typeof visibility)}>
                    <SelectTrigger id="visibility"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="all_jkkn">All JKKN</SelectItem>
                      <SelectItem value="institution">Institution only</SelectItem>
                      <SelectItem value="invited">Invited only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="What is this event about?" />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitting ? 'Submitting…' : 'Submit proposal'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
