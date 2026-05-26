'use client';

import { useState } from 'react';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2 } from 'lucide-react';

interface EditableCellProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  maxLength?: number;
  placeholder?: string;
}

export default function EditableCell({
  value,
  onSave,
  maxLength = 100,
  placeholder = '',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (tempValue === value) {
      setEditing(false);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave(tempValue);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setEditing(false);
    }
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className="cursor-text p-2 hover:bg-blue-50 rounded transition-colors"
      >
        {value}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error && <AlertBox type="error" message={error} />}
      <input
        autoFocus
        type="text"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value.slice(0, maxLength))}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={saving}
        className="w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="text-xs text-muted-foreground">
        {tempValue.length}/{maxLength} · Press Enter to save, Esc to cancel
      </div>
    </div>
  );
}
