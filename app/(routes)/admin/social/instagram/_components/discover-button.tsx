'use client';

/**
 * Discover Button — triggers account discovery + sync.
 * Calls POST /api/social/instagram/discover then POST /api/social/instagram/sync.
 * Both routes delivered by Agent γ. Until merged, the button shows the error
 * state clearly so Director knows it's pending the other PR.
 */

import { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import toast from 'react-hot-toast';
import { discoverIgAccounts, syncIgMetrics } from '@/services/instagram-service';

interface DiscoverButtonProps {
  onComplete?: () => void;
}

type Phase = 'idle' | 'discovering' | 'syncing' | 'done' | 'error';

export function DiscoverButton({ onComplete }: DiscoverButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);

  const handleDiscover = async () => {
    setPhase('discovering');
    setProgress(20);
    setSummary(null);

    try {
      const discoverResult = await discoverIgAccounts();
      setProgress(60);
      setPhase('syncing');

      const syncResult = await syncIgMetrics();
      setProgress(100);
      setPhase('done');

      const msg = `Found ${discoverResult.discovered} accounts, synced metrics for ${syncResult.synced}.`;
      setSummary(msg);
      toast.success(msg);
      onComplete?.();
    } catch (err) {
      setPhase('error');
      setProgress(0);
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Discovery failed: ${message}`);
    } finally {
      // Reset after 4 s so button is reusable
      setTimeout(() => {
        setPhase('idle');
        setProgress(0);
        setSummary(null);
      }, 4000);
    }
  };

  const isRunning = phase === 'discovering' || phase === 'syncing';

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={handleDiscover}
        disabled={isRunning}
        variant="default"
        size="sm"
        className="gap-2"
      >
        {isRunning ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        {phase === 'idle' && 'Discover Accounts'}
        {phase === 'discovering' && 'Discovering...'}
        {phase === 'syncing' && 'Syncing Metrics...'}
        {phase === 'done' && 'Done'}
        {phase === 'error' && 'Retry'}
      </Button>

      {isRunning && (
        <Progress value={progress} className="h-1.5 w-40" />
      )}

      {summary && (
        <p className="text-xs text-muted-foreground">{summary}</p>
      )}
    </div>
  );
}
