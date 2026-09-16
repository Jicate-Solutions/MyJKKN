'use client';

/**
 * Insta Solver — the box you type a tracking code into.
 *
 * Deliberately a NAVIGATION, not a lookup. Submitting pushes
 * /instasolver/track/<code> and that page does the work, so the code lives in
 * the URL and the person can bookmark it, reopen it, or send it to themselves.
 * No redirect on arrival either: somebody who lands here without a code sees
 * the box, not a bounce (rule #27).
 *
 * An empty box is answered here rather than by navigating to a URL that would
 * only come back saying the same thing.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function TrackForm() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [emptyWarning, setEmptyWarning] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setEmptyWarning(true);
      return;
    }
    setEmptyWarning(false);
    // Encoded on the way in; the page reads params.token, which Next.js has
    // already decoded by the time it gets there.
    router.push(`/instasolver/track/${encodeURIComponent(trimmed)}`);
  }

  return (
    <Card className="mt-4">
      <CardContent className="py-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tracking-code">Enter your tracking code</Label>
            <Input
              id="tracking-code"
              value={code}
              autoComplete="off"
              spellCheck={false}
              placeholder="anon_…"
              className="font-mono"
              onChange={(e) => {
                setCode(e.target.value);
                if (emptyWarning) setEmptyWarning(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              The code you were given when you filed without your name. Codes are case-sensitive.
            </p>
            {emptyWarning ? (
              <p className="text-sm text-destructive">
                Type your tracking code first — without it there is nothing to look up.
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full sm:w-auto">
            Check progress
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
