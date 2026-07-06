'use client';

/**
 * /schools-portal/update-contact
 *
 * Lets the HM update their own school_contacts row: name, phone, alternate
 * notes. Email cannot be changed here because it is the magic-link
 * identifier; an admin has to update it via the admin module.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

interface ApiPayload {
  ok: boolean;
  error?: string;
  selfContact: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    notes: string | null;
  } | null;
}

export default function UpdateContactPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Field state. We treat empty strings as "clear the field" in the PATCH,
  // because users explicitly emptying a textbox should clear DB-side.
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [email, setEmail] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/schools-portal/me', { cache: 'no-store' });
      if (res.status === 401) {
        router.replace('/schools-portal/login');
        return;
      }
      const json = (await res.json().catch(() => ({}))) as ApiPayload;
      if (!res.ok || !json.ok || !json.selfContact) {
        setError(json.error || 'Could not load your contact details');
        return;
      }
      setName(json.selfContact.name ?? '');
      setPhone(json.selfContact.phone ?? '');
      setNotes(json.selfContact.notes ?? '');
      setEmail(json.selfContact.email ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error('Name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/schools-portal/me/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error(json.error || 'Save failed');
        return;
      }
      toast.success('Contact details updated');
      router.replace('/schools-portal/dashboard');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-4">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-12 text-center">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-semibold text-[#11243a]">
            Couldn't load your details
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <Button
            onClick={() => void load()}
            variant="outline"
            className="mt-4"
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 py-2">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href="/schools-portal/dashboard">
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to dashboard
        </Link>
      </Button>

      <form
        onSubmit={submit}
        className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
      >
        <h1 className="text-lg font-semibold text-[#11243a]">
          Update your contact details
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          These details help the JKKN team reach you. Email is the sign-in
          identifier and can only be changed by JKKN.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="mt-1 h-11 rounded-lg"
            />
          </div>

          <div>
            <Label htmlFor="email">Email (read-only)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              disabled
              className="mt-1 h-11 cursor-not-allowed rounded-lg bg-slate-50 text-muted-foreground"
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              maxLength={32}
              placeholder="e.g., +91 98765 43210"
              className="mt-1 h-11 rounded-lg"
            />
          </div>

          <div>
            <Label htmlFor="notes">
              Alternate contact / notes
              <span className="ml-1 text-xs text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder="e.g., second phone for after-school hours, an alternate contact"
              rows={4}
              className="mt-1 rounded-lg"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/schools-portal/dashboard')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-[#0b6d41] hover:bg-[#0e7a49]"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Save changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
