'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X, Plus, Save, Loader2, CheckCircle2 } from 'lucide-react';
import { useUpdateCapabilities } from '@/hooks/use-department-tracker';

interface CapabilitiesEditorProps {
  solutionDepartmentId: string;
  initialCapabilities: string[];
  onSave?: () => void;
}

export function CapabilitiesEditor({
  solutionDepartmentId,
  initialCapabilities,
  onSave,
}: CapabilitiesEditorProps) {
  const [capabilities, setCapabilities] = useState<string[]>(initialCapabilities);
  const [newCapability, setNewCapability] = useState('');
  const [saved, setSaved] = useState(false);
  const { updateCapabilities, loading, error } = useUpdateCapabilities();

  const isDirty = JSON.stringify(capabilities) !== JSON.stringify(initialCapabilities);

  const addCapability = useCallback(() => {
    const cap = newCapability.trim().toLowerCase().replace(/\s+/g, '-');
    if (cap && !capabilities.includes(cap)) {
      setCapabilities((prev) => [...prev, cap]);
      setNewCapability('');
      setSaved(false);
    }
  }, [newCapability, capabilities]);

  const removeCapability = useCallback((cap: string) => {
    setCapabilities((prev) => prev.filter((c) => c !== cap));
    setSaved(false);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCapability();
    }
  };

  const handleSave = async () => {
    try {
      await updateCapabilities(solutionDepartmentId, capabilities);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSave?.();
    } catch {
      // Error is handled by the hook
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Capabilities</CardTitle>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-green-600" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              {saved ? 'Saved!' : 'Save Changes'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Current capabilities */}
        <div className="flex flex-wrap gap-1.5 mb-3 min-h-[32px]">
          {capabilities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No capabilities defined yet.</p>
          ) : (
            capabilities.map((cap) => (
              <Badge key={cap} variant="secondary" className="text-xs gap-1 pr-1">
                {cap}
                <button
                  onClick={() => removeCapability(cap)}
                  className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>

        {/* Add new capability */}
        <div className="flex gap-2">
          <Input
            placeholder="Add capability (e.g., data-analytics)"
            value={newCapability}
            onChange={(e) => setNewCapability(e.target.value)}
            onKeyDown={handleKeyDown}
            className="text-sm"
          />
          <Button size="sm" variant="outline" onClick={addCapability} disabled={!newCapability.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-destructive mt-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
