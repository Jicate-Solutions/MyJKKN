'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle,
  Trash2,
  Receipt,
  Users,
  Clock,
  X
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface DeletionItem {
  id: string;
  title: string;
  subtitle?: string;
  amount?: number;
  status?: string;
  type?: 'bill' | 'student' | 'category';
}

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description?: string;
  items?: DeletionItem[];
  itemType?: 'bill' | 'bills' | 'student' | 'students' | 'category' | 'categories';
  isLoading?: boolean;
  warningMessage?: string;
  showCascadeWarning?: boolean;
}

export function DeleteConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  items = [],
  itemType = 'bill',
  isLoading = false,
  warningMessage,
  showCascadeWarning = false
}: DeleteConfirmationModalProps) {
  const itemCount = items.length;
  const isBulkDelete = itemCount > 1;

  const totalAmount = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  const handleConfirm = async () => {
    try {
      await onConfirm();
    } catch (error) {
      console.error('Error during deletion:', error);
    }
  };

  const getIcon = () => {
    switch (itemType) {
      case 'bill':
      case 'bills':
        return <Receipt className="h-5 w-5" />;
      case 'student':
      case 'students':
        return <Users className="h-5 w-5" />;
      default:
        return <Trash2 className="h-5 w-5" />;
    }
  };

  const getDeleteButtonText = () => {
    if (isLoading) return 'Deleting...';
    if (isBulkDelete) return `Delete ${itemCount} ${itemType}`;
    return `Delete ${itemType}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold text-gray-900">
                {title}
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {description && (
            <DialogDescription className="text-gray-600">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          {isBulkDelete && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getIcon()}
                  <span className="font-medium">
                    {itemCount} {itemType} selected
                  </span>
                </div>
                {totalAmount > 0 && (
                  <div className="text-right">
                    <span className="text-sm text-gray-500">Total Amount</span>
                    <div className="font-semibold text-lg">
                      {formatCurrency(totalAmount)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Items List */}
          {items.length > 0 && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {items.slice(0, 5).map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {item.title}
                    </p>
                    {item.subtitle && (
                      <p className="text-sm text-gray-500 truncate">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    {item.status && (
                      <Badge
                        variant={
                          item.status === 'paid'
                            ? 'default'
                            : item.status === 'overdue'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {item.status}
                      </Badge>
                    )}
                    {item.amount && (
                      <span className="font-semibold text-sm">
                        {formatCurrency(item.amount)}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {items.length > 5 && (
                <div className="text-center py-2">
                  <span className="text-sm text-gray-500">
                    and {items.length - 5} more {itemType}...
                  </span>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Warning Messages */}
          <div className="space-y-3">
            {showCascadeWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-800">
                    Cascade Deletion
                  </span>
                </div>
                <p className="text-sm text-amber-700 mt-1">
                  This will automatically delete all related records including payments,
                  discounts, receipts, and refunds. The billing summary will be updated.
                </p>
              </div>
            )}

            {warningMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-sm font-medium text-red-800">
                    Important Warning
                  </span>
                </div>
                <p className="text-sm text-red-700 mt-1">
                  {warningMessage}
                </p>
              </div>
            )}

            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-800">
                  This action cannot be undone
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                Once deleted, this data cannot be recovered. Please make sure you want to proceed.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            )}
            <Trash2 className="h-4 w-4 mr-2" />
            {getDeleteButtonText()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}