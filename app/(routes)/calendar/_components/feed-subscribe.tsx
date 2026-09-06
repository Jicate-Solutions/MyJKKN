'use client';

import { useEffect, useState } from 'react';
import { Copy, RefreshCw, Trash2, Rss } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  useMyFeedToken,
  useGenerateFeedToken,
  useRevokeFeedToken,
} from '@/hooks/calendar/use-calendar';
import { getErrorMessage } from '@/lib/utils';

export function FeedSubscribe() {
  const { toast } = useToast();

  // All hooks unconditional at the top
  const { data: token, isLoading } = useMyFeedToken();
  const generate = useGenerateFeedToken();
  const revoke = useRevokeFeedToken();

  // Guard window access: set origin after mount to avoid SSR mismatch
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const feedUrl = token && origin ? `${origin}/api/calendar/feed/${token}.ics` : '';

  const handleCopy = async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast({ title: 'Feed URL copied to clipboard' });
    } catch (err) {
      toast({ title: 'Copy failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync();
      toast({ title: 'Feed URL generated', description: 'Use the URL below to subscribe.' });
    } catch (err) {
      toast({ title: 'Failed to generate feed URL', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const handleRegenerate = async () => {
    try {
      await generate.mutateAsync();
      toast({
        title: 'Feed URL regenerated',
        description: 'Your old subscription URL has been revoked. Update it in Google Calendar.',
      });
    } catch (err) {
      toast({ title: 'Failed to regenerate', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const handleRevoke = async () => {
    try {
      await revoke.mutateAsync();
      toast({ title: 'Feed URL revoked', description: 'Your calendar subscription link has been disabled.' });
    } catch (err) {
      toast({ title: 'Failed to revoke', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Rss className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Subscribe in Google Calendar</CardTitle>
        </div>
        <CardDescription>
          Get your personal calendar — holidays, events, meetings, and reservations — in Google Calendar via a private ICS feed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {token ? (
          <>
            <div className="flex gap-2">
              <Input
                readOnly
                value={feedUrl}
                className="font-mono text-xs"
                aria-label="Calendar feed URL"
              />
              <Button variant="outline" size="icon" onClick={handleCopy} title="Copy URL">
                <Copy className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={generate.isPending}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Regenerate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevoke}
                disabled={revoke.isPending}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Revoke
              </Button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong>How to subscribe:</strong> In Google Calendar, click <strong>Other calendars</strong> → <strong>+</strong> → <strong>From URL</strong> → paste this link → <strong>Add calendar</strong>.
              Updates may take Google several hours to appear.{' '}
              <span className="text-amber-600 dark:text-amber-500">
                This link is private — anyone who has it can see your calendar. Regenerate to invalidate the old URL.
              </span>
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Generate a private subscription URL to add your MyJKKN calendar (holidays, events, meetings, reservations) to Google Calendar or any app that supports ICS feeds.
            </p>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generate.isPending}
            >
              <Rss className="mr-1.5 h-3.5 w-3.5" />
              Generate feed URL
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
