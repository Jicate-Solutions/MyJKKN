'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useCreateImsIndent } from '@/hooks/ims/use-ims-indents';
import { useImsItemsForSelect } from '@/hooks/ims/use-ims-inventory';
import { useImsUnitsForSelect } from '@/hooks/ims/use-ims-settings';
import { useDepartments } from '@/hooks/organization/use-departments';
import type { ImsIndentUrgency } from '@/types/ims/indents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

interface IndentItemRow {
  item_id: string;
  quantity: number;
  unit_id: string;
  notes: string;
}

export default function NewIndentPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();

  const [departmentId, setDepartmentId] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [urgency, setUrgency] = useState<ImsIndentUrgency>('normal');
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState('');
  const [items, setItems] = useState<IndentItemRow[]>([]);

  const { data: departmentsData } = useDepartments({
    institution_id: institutionId,
  });
  const { data: itemsForSelect, isLoading: itemsLoading } =
    useImsItemsForSelect(storeId ?? '', institutionId);
  const { data: unitsForSelect, isLoading: unitsLoading } =
    useImsUnitsForSelect();
  const createIndent = useCreateImsIndent();

  const departments = departmentsData?.data || [];

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { item_id: '', quantity: 1, unit_id: '', notes: '' },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof IndentItemRow,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async () => {
    if (!departmentId) {
      toast.error('Please select a department');
      return;
    }
    if (!purpose.trim()) {
      toast.error('Please enter the purpose');
      return;
    }
    if (items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }
    const invalidItems = items.filter(
      (item) => !item.item_id || !item.unit_id || item.quantity <= 0
    );
    if (invalidItems.length > 0) {
      toast.error('Please fill in all item fields correctly');
      return;
    }
    if (isEmergency && !emergencyReason.trim()) {
      toast.error('Please provide an emergency reason');
      return;
    }

    try {
      await createIndent.mutateAsync({
        data: {
          department_id: departmentId,
          required_date: requiredDate || undefined,
          purpose,
          urgency,
          is_emergency: isEmergency,
          emergency_reason: isEmergency ? emergencyReason : undefined,
          store_id: storeId ?? undefined,
          institution_id: institutionId || '',
          items: items.map((item) => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit_id: item.unit_id,
            notes: item.notes || undefined,
          })),
        },
        userId: profile?.id || '',
      });
      toast.success('Indent request created successfully');
      router.push('/ims/indents');
    } catch (error) {
      const errMsg = (error as any)?.message ?? 'Unknown error. Check console for details.';
      toast.error(`Failed to create indent request: ${errMsg}`);
    }
  };

  const isSubmitting = createIndent.isPending;

  return (
    <ContentLayout title="Create Indent Request">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/ims/indents')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Create Indent Request</h2>
            <p className="text-muted-foreground">
              Submit a new indent request for materials
            </p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Department */}
              <div className="space-y-2">
                <Label htmlFor="department">Department *</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger id="department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept: { id: string; department_name: string }) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Required Date */}
              <div className="space-y-2">
                <Label htmlFor="required-date">Required Date</Label>
                <Input
                  id="required-date"
                  type="date"
                  value={requiredDate}
                  onChange={(e) => setRequiredDate(e.target.value)}
                />
              </div>

              {/* Urgency */}
              <div className="space-y-2">
                <Label htmlFor="urgency">Urgency *</Label>
                <Select
                  value={urgency}
                  onValueChange={(val) => setUrgency(val as ImsIndentUrgency)}
                >
                  <SelectTrigger id="urgency">
                    <SelectValue placeholder="Select urgency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Emergency Toggle */}
              <div className="space-y-2">
                <Label>Emergency Request</Label>
                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    checked={isEmergency}
                    onCheckedChange={setIsEmergency}
                  />
                  <span className="text-sm text-muted-foreground">
                    {isEmergency ? 'Emergency enabled' : 'Not an emergency'}
                  </span>
                </div>
              </div>
            </div>

            {/* Purpose */}
            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose *</Label>
              <Textarea
                id="purpose"
                placeholder="Describe the purpose of this indent request..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                rows={3}
              />
            </div>

            {/* Emergency Reason */}
            {isEmergency && (
              <div className="space-y-2">
                <Label htmlFor="emergency-reason">Emergency Reason *</Label>
                <Textarea
                  id="emergency-reason"
                  placeholder="Explain why this is an emergency..."
                  value={emergencyReason}
                  onChange={(e) => setEmergencyReason(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Items</CardTitle>
              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {itemsLoading || unitsLoading ? (
              <div className="flex items-center justify-center py-8">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <p>No items added yet. Click &quot;Add Item&quot; to begin.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Item</TableHead>
                    <TableHead className="w-[15%]">Quantity</TableHead>
                    <TableHead className="w-[20%]">Unit</TableHead>
                    <TableHead className="w-[25%]">Notes</TableHead>
                    <TableHead className="w-[10%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          value={item.item_id}
                          onValueChange={(val) =>
                            handleItemChange(index, 'item_id', val)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            {(itemsForSelect || []).map(
                              (itm: { id: string; name: string; code: string }) => (
                                <SelectItem key={itm.id} value={itm.id}>
                                  {itm.name} ({itm.code})
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            handleItemChange(
                              index,
                              'quantity',
                              parseInt(e.target.value) || 0
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.unit_id}
                          onValueChange={(val) =>
                            handleItemChange(index, 'unit_id', val)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            {(unitsForSelect || []).map(
                              (unit: { id: string; name: string; abbreviation: string }) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name} ({unit.abbreviation})
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Notes..."
                          value={item.notes}
                          onChange={(e) =>
                            handleItemChange(index, 'notes', e.target.value)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveItem(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={() => router.push('/ims/indents')}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <BeatLoader color="white" size={8} />
            ) : (
              'Submit Indent Request'
            )}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
