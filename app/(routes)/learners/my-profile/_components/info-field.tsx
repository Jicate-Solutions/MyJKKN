import { cn } from '@/lib/utils';

interface InfoFieldProps {
  label: string;
  value: any;
  className?: string;
  isChanged?: boolean;
}

export function InfoField({ label, value, className, isChanged }: InfoFieldProps) {
  const displayValue = value ?? 'Not provided';

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn(
        'text-sm font-medium',
        isChanged && 'text-yellow-700 font-semibold'
      )}>
        {displayValue}
      </p>
    </div>
  );
}
