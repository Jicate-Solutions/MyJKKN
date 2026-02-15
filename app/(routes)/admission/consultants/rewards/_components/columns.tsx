'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import {
  Percent,
  DollarSign,
  CreditCard,
  Tag,
  ShoppingBag,
  Gift,
} from 'lucide-react';
import { format } from 'date-fns';
import type { ReferralRewardConfig } from '@/types/education-consultants';
import { DataTableRowActions } from './row-actions';

// Reward type configuration (shared)
export const rewardTypeConfig: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  discount: { label: 'Discount', icon: Percent, color: 'text-blue-500' },
  fee_discount: { label: 'Fee Discount', icon: Percent, color: 'text-blue-500' },
  cashback: { label: 'Cashback', icon: DollarSign, color: 'text-green-500' },
  cash: { label: 'Cash', icon: DollarSign, color: 'text-green-500' },
  credit: { label: 'Credit', icon: CreditCard, color: 'text-purple-500' },
  credits: { label: 'Credits', icon: CreditCard, color: 'text-purple-500' },
  voucher: { label: 'Voucher', icon: Tag, color: 'text-orange-500' },
  merchandise: { label: 'Merchandise', icon: ShoppingBag, color: 'text-pink-500' },
};

export const defaultTypeConfig = {
  label: 'Other',
  icon: Gift,
  color: 'text-gray-500',
};

function formatRewardValue(config: ReferralRewardConfig) {
  if (config.reward_value_type === 'percentage') {
    return `${config.reward_value}%`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(config.reward_value);
}

export const columns: ColumnDef<ReferralRewardConfig>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    maxSize: 50,
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const config = row.original;
      return (
        <div>
          <div className="font-medium">{config.name}</div>
          {config.description && (
            <div className="text-xs text-muted-foreground line-clamp-1">
              {config.description}
            </div>
          )}
        </div>
      );
    },
    size: 250,
    minSize: 180,
  },
  {
    accessorKey: 'reward_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Type" />
    ),
    cell: ({ row }) => {
      const type = row.getValue('reward_type') as string;
      const typeConf = rewardTypeConfig[type] || defaultTypeConfig;
      const TypeIcon = typeConf.icon;
      return (
        <div className="flex items-center gap-2">
          <TypeIcon className={`h-4 w-4 ${typeConf.color}`} />
          <span>{typeConf.label}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'reward_value',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Value" />
    ),
    cell: ({ row }) => (
      <span className="font-medium">{formatRewardValue(row.original)}</span>
    ),
    maxSize: 120,
  },
  {
    accessorKey: 'referrer_type',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Applicable To" />
    ),
    cell: ({ row }) => {
      const type = row.getValue('referrer_type') as string;
      return (
        <Badge variant="outline" className="capitalize">
          {type || 'All'}
        </Badge>
      );
    },
    maxSize: 130,
  },
  {
    accessorKey: 'min_referrals_required',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Referrals" />
    ),
    cell: ({ row }) => {
      const config = row.original;
      return (
        <span className="text-sm">
          {config.min_referrals ?? 1}
          {config.max_rewards_per_referrer
            ? ` - ${config.max_rewards_per_referrer}`
            : '+'}
        </span>
      );
    },
    maxSize: 110,
  },
  {
    accessorKey: 'is_active',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const isActive = row.getValue('is_active') as boolean;
      return (
        <Badge variant={isActive ? 'default' : 'secondary'}>
          {isActive ? 'Active' : 'Inactive'}
        </Badge>
      );
    },
    maxSize: 100,
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      const date = row.getValue('created_at') as string;
      return date ? format(new Date(date), 'dd MMM yyyy') : '-';
    },
    maxSize: 120,
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DataTableRowActions row={row} />,
    maxSize: 70,
  },
];
