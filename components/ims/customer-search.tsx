'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ImsCustomerType } from '@/types/ims';

const CUSTOMER_TYPES: { value: ImsCustomerType; label: string }[] = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'student', label: 'Student' },
  { value: 'staff', label: 'Staff' },
  { value: 'patient', label: 'Patient' },
];

interface CustomerSearchProps {
  customerType: ImsCustomerType;
  customerName: string;
  customerPhone: string;
  onTypeChange: (type: ImsCustomerType) => void;
  onNameChange: (name: string) => void;
  onPhoneChange: (phone: string) => void;
}

export function CustomerSearch({
  customerType,
  customerName,
  customerPhone,
  onTypeChange,
  onNameChange,
  onPhoneChange,
}: CustomerSearchProps) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs text-muted-foreground">Customer Type</Label>
        <Select value={customerType} onValueChange={(v) => onTypeChange(v as ImsCustomerType)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CUSTOMER_TYPES.map((ct) => (
              <SelectItem key={ct.value} value={ct.value}>
                {ct.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-muted-foreground">Name (optional)</Label>
          <Input
            placeholder="Customer name"
            value={customerName}
            onChange={(e) => onNameChange(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Phone (optional)</Label>
          <Input
            placeholder="Phone number"
            value={customerPhone}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
    </div>
  );
}
