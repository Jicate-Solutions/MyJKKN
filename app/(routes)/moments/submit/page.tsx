'use client';

// app/(routes)/moments/submit/page.tsx
//
// Family Moments — teacher submission page.
// A teacher finds their student, types the child's 2-3 line message (and/or
// photographs the drawing), submits. The row already exists (pre-seeded with
// an auto-card), so submission is an UPDATE that upgrades the card.
//
// Gate: moments.submissions.create (granted to faculty/school_faculty/
// principal/hod via seed). RLS scopes both reads and writes to the
// teacher's institution.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  MomentsService,
  type FamilyMoment,
  type MomentsCampaign,
} from '@/lib/services/moments/moments-service';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Camera, Check, Heart, Search } from 'lucide-react';

function MomentsSubmitInner() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [campaigns, setCampaigns] = useState<MomentsCampaign[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [moments, setMoments] = useState<FamilyMoment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState<FamilyMoment | null>(null);
  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await MomentsService.getCollectingCampaigns();
        if (cancelled) return;
        setCampaigns(list);
        if (list.length > 0) setCampaignId(list[0].id);
        else setLoading(false);
      } catch (error) {
        console.error('[moments] Failed to load campaigns:', error);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rows = await MomentsService.getMoments(campaignId);
        if (!cancelled) setMoments(rows);
      } catch (error) {
        console.error('[moments] Failed to load students:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return moments;
    return moments.filter(
      (m) =>
        m.child_name.toLowerCase().includes(q) ||
        (m.child_class ?? '').toLowerCase().includes(q),
    );
  }, [moments, search]);

  const openEditor = useCallback((moment: FamilyMoment) => {
    setSelected(moment);
    setMessage(moment.message_text ?? '');
    setImageFile(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected || !profile?.id) return;
    if (!message.trim() && !imageFile) {
      toast({
        title: 'Nothing to save',
        description: 'Type the child’s message or add a photo of the drawing.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await MomentsService.submitContent(selected, {
        messageText: message,
        imageFile,
        submittedBy: profile.id,
      });
      toast({
        title: 'Saved ❤️',
        description: `${selected.child_name}'s card is ready for Father's Day.`,
      });
      setSelected(null);
      if (campaignId) setMoments(await MomentsService.getMoments(campaignId));
    } catch (error) {
      console.error('[moments] Submit failed:', error);
      toast({
        title: 'Could not save',
        description: 'Please try again — if it repeats, contact the office.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [selected, profile?.id, message, imageFile, campaignId, toast]);

  const activeCampaign = campaigns.find((c) => c.id === campaignId);
  const doneCount = moments.filter((m) => m.content_type !== 'auto').length;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Heart className="h-6 w-6 text-rose-500 shrink-0" />
          Family Moments
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Collect each child&rsquo;s message for{' '}
          {activeCampaign ? activeCampaign.title : 'the active campaign'} —
          parents receive it as a personalized card.
        </p>
      </div>

      {campaigns.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {campaigns.map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={c.id === campaignId ? 'default' : 'outline'}
              onClick={() => setCampaignId(c.id)}
            >
              {c.title}
            </Button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading students…
        </div>
      ) : !activeCampaign ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No active campaign right now. The office opens collection before
            each occasion.
          </CardContent>
        </Card>
      ) : selected ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selected.child_name}</CardTitle>
            <CardDescription>
              {selected.child_class ? `${selected.child_class} · ` : ''}
              Card for {selected.recipient_name ?? 'parent'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                The child&rsquo;s message (2–3 lines, their own words)
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="My Appa is my hero because…"
                rows={4}
                maxLength={400}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Drawing / craft photo (optional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Camera className="h-4 w-4 mr-2" />
                {imageFile ? imageFile.name : 'Take / choose a photo'}
              </Button>
              <p className="text-xs text-muted-foreground mt-1">
                Photos are compressed automatically — any phone photo works.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSubmit} disabled={saving} className="flex-1">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Save card
              </Button>
              <Button
                variant="outline"
                onClick={() => setSelected(null)}
                disabled={saving}
              >
                Back
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search child name or class…"
                className="pl-9"
              />
            </div>
            <Badge variant="secondary" className="whitespace-nowrap">
              {doneCount}/{moments.length} done
            </Badge>
          </div>

          <div className="grid gap-2">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => openEditor(m)}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent transition-colors"
              >
                <div>
                  <p className="font-medium">{m.child_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.child_class ?? '—'}
                  </p>
                </div>
                {m.content_type !== 'auto' ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600">
                    <Check className="h-3 w-3 mr-1" /> Done
                  </Badge>
                ) : (
                  <Badge variant="outline">Pending</Badge>
                )}
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No students match &ldquo;{search}&rdquo;.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default function MomentsSubmitPage() {
  return (
    <PermissionGuard
      module="moments.submissions"
      action="create"
      // Rule #27: permission failures must be explicit, never a blank page.
      fallback={
        <div className="container mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">
            You don&rsquo;t have access to Family Moments
          </h1>
          <p className="text-muted-foreground text-sm mt-2">
            This page is for teachers collecting children&rsquo;s messages.
            If you should have access, contact your school office to get the
            &ldquo;Moments — Submit&rdquo; permission added to your role.
          </p>
        </div>
      }
    >
      <MomentsSubmitInner />
    </PermissionGuard>
  );
}
