import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  statusCode: number;
  size?: 'sm' | 'md' | 'lg';
}

const getStatusColor = (code: number): string => {
  if (code >= 200 && code < 300) {
    return 'bg-green-500 hover:bg-green-600 text-white';
  }
  if (code >= 300 && code < 400) {
    return 'bg-blue-500 hover:bg-blue-600 text-white';
  }
  if (code >= 400 && code < 500) {
    return 'bg-yellow-500 hover:bg-yellow-600 text-white';
  }
  if (code >= 500) {
    return 'bg-red-500 hover:bg-red-600 text-white';
  }
  return 'bg-gray-500 hover:bg-gray-600 text-white';
};

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-1.5',
};

export function StatusBadge({ statusCode, size = 'md' }: StatusBadgeProps) {
  const colorClass = getStatusColor(statusCode);
  const sizeClass = SIZE_CLASSES[size];

  return (
    <Badge
      className={`${colorClass} ${sizeClass} font-semibold font-mono`}
      aria-label={`HTTP status code ${statusCode}`}
    >
      {statusCode}
    </Badge>
  );
}
