'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  COPQ_CATEGORY_LABELS,
  COPQ_CATEGORY_DESCRIPTIONS,
  type COPQCategory
} from '@/types/billing-copq';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface COPQCategorySelectProps {
  value?: COPQCategory | '';
  onValueChange: (value: COPQCategory | '') => void;
  placeholder?: string;
  includeAll?: boolean;
  disabled?: boolean;
  className?: string;
}

export function COPQCategorySelect({
  value,
  onValueChange,
  placeholder = 'Select category',
  includeAll = false,
  disabled = false,
  className
}: COPQCategorySelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onValueChange(v as COPQCategory | '')}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && (
          <SelectItem value=''>All Categories</SelectItem>
        )}
        {Object.entries(COPQ_CATEGORY_LABELS).map(([categoryKey, label]) => (
          <SelectItem key={categoryKey} value={categoryKey}>
            <div className='flex items-center gap-2'>
              <span>{label}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className='h-3 w-3 text-muted-foreground' />
                  </TooltipTrigger>
                  <TooltipContent side='right' className='max-w-xs'>
                    <p className='text-sm'>
                      {COPQ_CATEGORY_DESCRIPTIONS[categoryKey as COPQCategory]}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Badge variant for displaying categories
export function COPQCategoryBadge({
  category
}: {
  category: COPQCategory;
}) {
  const colorMap: Record<COPQCategory, string> = {
    refund_processing: 'bg-purple-100 text-purple-800',
    late_payment_followup: 'bg-orange-100 text-orange-800',
    invoice_error: 'bg-red-100 text-red-800',
    payment_reconciliation: 'bg-yellow-100 text-yellow-800',
    discount_dispute: 'bg-pink-100 text-pink-800',
    collection_cost: 'bg-indigo-100 text-indigo-800',
    bad_debt: 'bg-gray-100 text-gray-800',
    reputation_impact: 'bg-amber-100 text-amber-800',
    process_rework: 'bg-cyan-100 text-cyan-800',
    other: 'bg-slate-100 text-slate-800'
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${colorMap[category]}`}
    >
      {COPQ_CATEGORY_LABELS[category]}
    </span>
  );
}
