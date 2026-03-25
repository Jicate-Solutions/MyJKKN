import { Badge } from '@/components/ui/badge';
import { HttpMethod } from '@/lib/types/api-documentation';

interface MethodBadgeProps {
  method: HttpMethod;
  size?: 'sm' | 'md' | 'lg';
}

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-blue-500 hover:bg-blue-600 text-white',
  POST: 'bg-green-500 hover:bg-green-600 text-white',
  PUT: 'bg-yellow-500 hover:bg-yellow-600 text-white',
  DELETE: 'bg-red-500 hover:bg-red-600 text-white',
  PATCH: 'bg-purple-500 hover:bg-purple-600 text-white',
};

const SIZE_CLASSES = {
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-3 py-1',
  lg: 'text-base px-4 py-1.5',
};

export function MethodBadge({ method, size = 'md' }: MethodBadgeProps) {
  const colorClass = METHOD_COLORS[method];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <Badge
      className={`${colorClass} ${sizeClass} font-semibold`}
      aria-label={`HTTP ${method} method`}
    >
      {method}
    </Badge>
  );
}
