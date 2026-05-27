'use client';

interface BatchSizeSelectorProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  disabled?: boolean;
}

const BATCH_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500] as const;

export default function BatchSizeSelector({
  value,
  onChange,
  label = 'Batch size',
  disabled = false,
}: BatchSizeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <label htmlFor="batch-size-select" className="text-sm font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <select
        id="batch-size-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="rounded border border-input bg-background px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {BATCH_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
}
