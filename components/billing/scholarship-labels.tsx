import { Badge } from '@/components/ui/badge';
import type { ScholarshipLabel } from '@/types/billing-schedule';

/** Category as a badge, with the type's name muted underneath when shown. */
export function ScholarshipCategoryBadge({
  category,
  type
}: {
  category?: Pick<ScholarshipLabel, 'name'> | null;
  type?: Pick<ScholarshipLabel, 'name'> | null;
}) {
  return (
    <div className='flex flex-col items-start gap-1'>
      <Badge variant='secondary'>{category?.name ?? '—'}</Badge>
      {type?.name && (
        <span className='text-xs text-muted-foreground'>{type.name}</span>
      )}
    </div>
  );
}
