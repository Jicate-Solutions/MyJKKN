'use client';

// ============================================================================
// Per-run cap chip — live, editable batch cap for routines whose registry
// entry declares a capPolicyKey (a platform_policies row, global scope).
// Shows the CURRENT value from the DB (the registry's configKnobs text is
// documentation; this chip is the live knob). Click to edit inline; the write
// goes straight to platform_policies and is gated by the existing
// platform_policies_update RLS policy (super_admin/admin) — a non-admin's
// save simply fails and the chip reports it.
//
// Degrades gracefully like model-chip: if the policy read fails or the key
// has no row, nothing renders. Values >= UNLIMITED_AT display as "effectively
// unlimited" (the curriculum_ai.batch_cap = 10000 convention).
// ============================================================================

import { useEffect, useState } from 'react';
import { Gauge, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';

const UNLIMITED_AT = 10000;

/**
 * Loads the global-scope platform_policies values for the given keys once and
 * returns Map<policy_key, number>. Any failure resolves to an empty map — the
 * chips simply don't render (never noisier because a read failed).
 */
export function useCapPolicyMap(keys: string[]): {
  map: Map<string, number>;
  setValue: (key: string, value: number) => void;
} {
  const [map, setMap] = useState<Map<string, number>>(new Map());
  // Stable dependency: the registry is static, so the key list never changes
  // at runtime; joining avoids re-fetch loops from a fresh array identity.
  const keyList = keys.slice().sort().join(',');

  useEffect(() => {
    if (!keyList) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('platform_policies')
          .select('policy_key, value')
          .in('policy_key', keyList.split(','))
          .eq('scope_type', 'global')
          .is('scope_id', null)
          .eq('is_active', true);
        if (error || !data) return;
        const m = new Map<string, number>();
        for (const row of data) {
          const n = Number(row.value);
          if (typeof row.policy_key === 'string' && Number.isFinite(n)) m.set(row.policy_key, n);
        }
        if (!cancelled) setMap(m);
      } catch {
        // silent — no chip, no error UI
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keyList]);

  function setValue(key: string, value: number) {
    setMap((prev) => {
      const m = new Map(prev);
      m.set(key, value);
      return m;
    });
  }

  return { map, setValue };
}

function fmtCap(n: number): string {
  if (n >= UNLIMITED_AT) return `unlimited (${n.toLocaleString('en-IN')})`;
  return `${n.toLocaleString('en-IN')}/run`;
}

/**
 * The chip itself. Renders nothing when the routine has no capPolicyKey or the
 * policy map has no value for it (row missing / read failed).
 */
export function CapChip({
  capPolicyKey,
  capMap,
  onSaved,
}: {
  capPolicyKey?: string;
  capMap: Map<string, number>;
  onSaved: (key: string, value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  if (!capPolicyKey) return null;
  const current = capMap.get(capPolicyKey);
  if (current === undefined) return null;

  async function save() {
    const n = parseInt(draft, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast.error('Cap must be a whole number of 1 or more (use 10000 for unlimited).');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClientSupabaseClient();
      // RLS platform_policies_update (super_admin/admin) is the authz gate.
      const { error } = await supabase
        .from('platform_policies')
        .update({ value: n, updated_at: new Date().toISOString() })
        .eq('policy_key', capPolicyKey)
        .eq('scope_type', 'global')
        .is('scope_id', null);
      if (error) throw error;
      onSaved(capPolicyKey, n);
      setEditing(false);
      toast.success(`Per-run cap saved: ${fmtCap(n)} — next run picks it up automatically.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'save failed';
      toast.error(`Cap not saved: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input
          type="number"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-6 w-24 px-2 text-xs"
          aria-label={`Per-run cap for ${capPolicyKey}`}
          autoFocus
        />
        <Button size="sm" variant="default" className="h-6 px-2 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          onClick={() => setEditing(false)}
          disabled={saving}
        >
          Cancel
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(current));
        setEditing(true);
      }}
      title={`Per-run cap — platform_policies row '${capPolicyKey}'. Click to edit (admin only). 10000 = effectively unlimited.`}
      className="inline-flex"
    >
      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground hover:text-foreground">
        <Gauge className="h-3 w-3" /> Cap: {fmtCap(current)}
      </Badge>
    </button>
  );
}
