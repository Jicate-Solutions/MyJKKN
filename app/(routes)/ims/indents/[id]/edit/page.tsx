'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsIndent, useUpdateImsIndent } from '@/hooks/ims/use-ims-indents';
import { useImsItemsForSelect } from '@/hooks/ims/use-ims-inventory';
import { useImsDepartmentsForSelect } from '@/hooks/ims/use-ims-departments';
import { useImsDeptScope } from '@/hooks/ims/use-ims-dept-scope';
import type { ImsIndentUrgency, ImsIndentWithItems } from '@/types/ims/indents';
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
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';
import { ImsPageGuard } from '@/components/ims/ims-page-guard';

interface IndentItemRow {
  item_id: string;
  quantity: number;
  unit_id: string;
  notes: string;
}

const EDITABLE_STATUSES = ['draft', 'pending_approval'];

export default function EditIndentPage() {
  return (
    <ImsPageGuard module="ims.indents" action="edit">
      <EditIndentLoader />
    </ImsPageGuard>
  );
}

function EditIndentLoader() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { data: indent, isLoading } = useImsIndent(id);

  if (isLoading) {
    return (
      <ContentLayout title="Edit Indent Request">
        <div className="flex items-center justify-center py-24">
          <BeatLoader color="hsl(var(--primary))" size={10} />
        </div>
      </ContentLayout>
    );
  }

  if (!indent) {
    return (
      <ContentLayout title="Edit Indent Request">
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <p className="text-lg">Indent not found</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push('/ims/indents')}>
            Back to Indents
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!EDITABLE_STATUSES.includes(indent.status)) {
    return (
      <ContentLayout title="Edit Indent Request">
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold">This indent can no longer be edited</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Only draft or pending-approval requests can be changed. This one has
              already been processed.
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push(`/ims/indents/${id}`)}>
            View Indent
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return <EditIndentForm indent={indent} />;
}

function EditIndentForm({ indent }: { indent: ImsIndentWithItems }) {
  const router = useRouter();
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();
  // Same RLS-driven scope used on the create form: a department-scoped user can
  // only keep this indent on their own department, so lock the field to it.
  const { data: deptScope } = useImsDeptScope();
  const isDeptLocked = !!deptScope?.isScoped;

  const [departmentId, setDepartmentId] = useState(indent.department_id ?? '');
  const [requiredDate, setRequiredDate] = useState(indent.required_date ?? '');
  const [purpose, setPurpose] = useState(indent.purpose ?? '');
  const [urgency, setUrgency] = useState<ImsIndentUrgency>(indent.urgency);
  const [isEmergency, setIsEmergency] = useState(indent.is_emergency ?? false);
  const [emergencyReason, setEmergencyReason] = useState(indent.emergency_reason ?? '');
  const [items, setItems] = useState<IndentItemRow[]>(
    (indent.items ?? []).map((it) => ({
      item_id: it.item_id,
      quantity: it.quantity,
      unit_id: it.unit_id,
      notes: it.notes ?? '',
    }))
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const {
    data: departments = [],
    isLoading: departmentsLoading,
    isError: departmentsError,
  } = useImsDepartmentsForSelect(institutionId);
  const { data: itemsForSelect, isLoading: itemsLoading } = useImsItemsForSelect(
    storeId ?? '',
    institutionId
  );
  const updateIndent = useUpdateImsIndent();

  const handleAddItem = () => {
    setItems((prev) => [...prev, { item_id: '', quantity: 1, unit_id: '', notes: '' }]);
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
    if (!profile?.id) {
      toast.error('User session not ready. Please refresh and try again.');
      return;
    }

    const errors: Record<string, string> = {};
    if (!departmentId) errors.department = 'Please select a department';
    if (!purpose.trim()) errors.purpose = 'Please enter the purpose';
    if (items.length === 0) {
      errors.items = 'Please add at least one item';
    } else {
      const hasInvalidItems = items.some(
        (item) => !item.item_id || !item.unit_id || item.quantity <= 0
      );
      if (hasInvalidItems) errors.items = 'Please fill in all item fields correctly';
    }
    if (isEmergency && !emergencyReason.trim())
      errors.emergencyReason = 'Please provide an emergency reason';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error('Please fix the highlighted fields before saving');
      return;
    }

    setFieldErrors({});

    try {
      await updateIndent.mutateAsync({
        id: indent.id,
        data: {
          department_id: departmentId,
          required_date: requiredDate || undefined,
          purpose,
          urgency,
          is_emergency: isEmergency,
          emergency_reason: isEmergency ? emergencyReason : undefined,
          items: items.map((item) => ({
            item_id: item.item_id,
            quantity: item.quantity,
            unit_id: item.unit_id,
            notes: item.notes || undefined,
          })),
        },
        userId: profile.id,
      });
      toast.success('Indent request updated successfully');
      router.push(`/ims/indents/${indent.id}`);
    } catch (error) {
      const errMsg = (error as any)?.message ?? 'Unknown error. Check console for details.';
      toast.error(`Failed to update indent request: ${errMsg}`);
    }
  };

  const isSubmitting = updateIndent.isPending;

  return (
    <ContentLayout title="Edit Indent Request">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/ims/indents/${indent.id}`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Edit {indent.indent_number}
            </h2>
            <p className="text-muted-foreground">Update this indent request</p>
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
                <Select
                  value={departmentId}
                  onValueChange={(val) => {
                    setDepartmentId(val);
                    setFieldErrors((e) => ({ ...e, department: '' }));
                  }}
                  disabled={departmentsLoading || departmentsError || isDeptLocked}
                >
                  <SelectTrigger
                    id="department"
                    className={fieldErrors.department ? 'border-destructive' : ''}
                  >
                    <SelectValue
                      placeholder={
                        departmentsLoading
                          ? 'Loading departments...'
                          : departmentsError
                            ? 'Failed to load departments'
                            : departments.length === 0
                              ? 'No departments available'
                              : 'Select department'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {departmentsError && (
                  <p className="text-sm text-destructive">
                    Could not load departments. Check your connection or contact an admin.
                  </p>
                )}
                {isDeptLocked && (
                  <p className="text-sm text-muted-foreground">
                    You can only raise indents for your own department, so this is
                    locked to it.
                  </p>
                )}
                {!departmentsError && fieldErrors.department && (
                  <p className="text-sm text-destructive">{fieldErrors.department}</p>
                )}
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
                <Select value={urgency} onValueChange={(val) => setUrgency(val as ImsIndentUrgency)}>
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
                  <Switch checked={isEmergency} onCheckedChange={setIsEmergency} />
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
                onChange={(e) => {
                  setPurpose(e.target.value);
                  setFieldErrors((err) => ({ ...err, purpose: '' }));
                }}
                rows={3}
                className={fieldErrors.purpose ? 'border-destructive' : ''}
              />
              {fieldErrors.purpose && (
                <p className="text-sm text-destructive">{fieldErrors.purpose}</p>
              )}
            </div>

            {/* Emergency Reason */}
            {isEmergency && (
              <div className="space-y-2">
                <Label htmlFor="emergency-reason">Emergency Reason *</Label>
                <Textarea
                  id="emergency-reason"
                  placeholder="Explain why this is an emergency..."
                  value={emergencyReason}
                  onChange={(e) => {
                    setEmergencyReason(e.target.value);
                    setFieldErrors((err) => ({ ...err, emergencyReason: '' }));
                  }}
                  rows={2}
                  className={fieldErrors.emergencyReason ? 'border-destructive' : ''}
                />
                {fieldErrors.emergencyReason && (
                  <p className="text-sm text-destructive">{fieldErrors.emergencyReason}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Items</CardTitle>
                {fieldErrors.items && (
                  <p className="text-sm text-destructive mt-1">{fieldErrors.items}</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={handleAddItem}>
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
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
                          onValueChange={(val) => {
                            const selectedItem = (itemsForSelect || []).find(
                              (i: { id: string }) => i.id === val
                            ) as {
                              id: string;
                              indent_unit_id?: string | null;
                              base_unit_id?: string | null;
                            } | undefined;
                            const autoUnitId =
                              selectedItem?.indent_unit_id || selectedItem?.base_unit_id || '';
                            setItems((prev) =>
                              prev.map((row, i) =>
                                i === index ? { ...row, item_id: val, unit_id: autoUnitId } : row
                              )
                            );
                          }}
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
                            handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const selectedItem = (itemsForSelect || []).find(
                            (i: { id: string }) => i.id === item.item_id
                          ) as {
                            id: string;
                            indent_unit?: { abbreviation: string } | null;
                            base_unit?: { abbreviation: string } | null;
                          } | undefined;
                          const unitAbbr =
                            selectedItem?.indent_unit?.abbreviation ||
                            selectedItem?.base_unit?.abbreviation;
                          if (!item.item_id)
                            return <span className="text-muted-foreground text-sm">—</span>;
                          if (!unitAbbr)
                            return (
                              <span className="text-destructive text-sm">No unit defined</span>
                            );
                          return (
                            <Badge variant="outline" className="font-mono">
                              {unitAbbr}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Notes..."
                          value={item.notes}
                          onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
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
            onClick={() => router.push(`/ims/indents/${indent.id}`)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <BeatLoader color="white" size={8} /> : 'Save Changes'}
          </Button>
        </div>
      </div>
    </ContentLayout>
  );
}
