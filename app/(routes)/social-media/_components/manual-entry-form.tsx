'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  type SmAccount,
  PLATFORM_LABELS,
} from '@/types/social-media';

interface ManualEntryFormProps {
  accountId: string;
  institutionId: string;
}

export function ManualEntryForm({ accountId, institutionId }: ManualEntryFormProps) {
  const [account, setAccount] = useState<SmAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [entryDate, setEntryDate] = useState('');
  const [followersCount, setFollowersCount] = useState('');
  const [likesCount, setLikesCount] = useState('');
  const [postsCount, setPostsCount] = useState('');
  const [notes, setNotes] = useState('');

  // Today's date in YYYY-MM-DD for max attribute
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    async function fetchAccount() {
      try {
        const res = await fetch(`/api/social-media/accounts/${encodeURIComponent(accountId)}`);
        if (!res.ok) throw new Error('Failed to load account');
        const data = await res.json();
        setAccount(data);
      } catch {
        setError('Could not load account details.');
      } finally {
        setLoading(false);
      }
    }
    fetchAccount();
  }, [accountId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Build payload — only include fields that have values
    const payload: Record<string, unknown> = {
      account_id: accountId,
      entry_date: entryDate,
    };
    if (followersCount !== '') payload.followers_count = Number(followersCount);
    if (likesCount !== '') payload.likes_count = Number(likesCount);
    if (postsCount !== '') payload.posts_count = Number(postsCount);
    if (notes.trim()) payload.notes = notes.trim();

    try {
      const res = await fetch('/api/social-media/manual-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        // Handle duplicate date entries
        if (data.error?.includes('duplicate') || data.error?.includes('unique') || res.status === 409) {
          throw new Error('An entry for this date already exists. Please choose a different date.');
        }
        throw new Error(data.error || 'Failed to save entry');
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Card className="max-w-lg mx-auto mt-8">
        <CardContent className="pt-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground mt-2">Loading account...</p>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="max-w-lg mx-auto mt-8">
        <CardContent className="pt-6 text-center space-y-4">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <h3 className="text-lg font-semibold">Entry Saved Successfully</h3>
          <p className="text-muted-foreground">
            Manual metrics for {entryDate} have been recorded.
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" asChild>
              <Link href={`/social-media/accounts/${accountId}`}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Account
              </Link>
            </Button>
            <Button
              onClick={() => {
                setSuccess(false);
                setEntryDate('');
                setFollowersCount('');
                setLikesCount('');
                setPostsCount('');
                setNotes('');
              }}
            >
              Add Another Entry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link href={`/social-media/accounts/${accountId}`}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Account
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            Manual Entry
            {account && (
              <span className="text-muted-foreground font-normal text-base ml-2">
                — {account.display_name || account.username} ({PLATFORM_LABELS[account.platform]})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Date picker */}
            <div className="space-y-2">
              <Label htmlFor="entry_date">Date *</Label>
              <Input
                id="entry_date"
                type="date"
                required
                max={today}
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The date these metrics were recorded. No future dates allowed.
              </p>
            </div>

            {/* Followers Count */}
            <div className="space-y-2">
              <Label htmlFor="followers_count">Followers Count</Label>
              <Input
                id="followers_count"
                type="number"
                min={0}
                placeholder="e.g. 1500"
                value={followersCount}
                onChange={(e) => setFollowersCount(e.target.value)}
              />
            </div>

            {/* Likes Count */}
            <div className="space-y-2">
              <Label htmlFor="likes_count">Likes Count</Label>
              <Input
                id="likes_count"
                type="number"
                min={0}
                placeholder="e.g. 320"
                value={likesCount}
                onChange={(e) => setLikesCount(e.target.value)}
              />
            </div>

            {/* Posts Count */}
            <div className="space-y-2">
              <Label htmlFor="posts_count">Posts Count</Label>
              <Input
                id="posts_count"
                type="number"
                min={0}
                placeholder="e.g. 45"
                value={postsCount}
                onChange={(e) => setPostsCount(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes about this entry..."
                maxLength={1000}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <p className="text-xs text-muted-foreground text-right">
                {notes.length}/1000
              </p>
            </div>

            {/* Error message */}
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {submitting ? 'Saving...' : 'Save Entry'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
