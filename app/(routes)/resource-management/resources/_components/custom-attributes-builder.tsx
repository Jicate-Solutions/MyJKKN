// app/(routes)/resource-management/resources/_components/custom-attributes-builder.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import {
  ATTRIBUTE_TYPE,
  type ResourceCustomAttribute,
  type AttributeType
} from '@/types/resource-management';
import { nanoid } from 'nanoid';

interface CustomAttributesBuilderProps {
  attributes: ResourceCustomAttribute[];
  onChange: (attributes: ResourceCustomAttribute[]) => void;
  disabled?: boolean;
}

export function CustomAttributesBuilder({
  attributes,
  onChange,
  disabled = false
}: CustomAttributesBuilderProps) {
  const addAttribute = () => {
    const newAttribute: ResourceCustomAttribute = {
      id: nanoid(),
      attribute_key: '',
      label: '',
      attribute_type: 'text',
      is_required: false,
      display_order: attributes.length + 1
    };
    onChange([...attributes, newAttribute]);
  };

  const removeAttribute = (id: string) => {
    onChange(attributes.filter((attr) => attr.id !== id));
  };

  const updateAttribute = (
    id: string,
    field: keyof ResourceCustomAttribute,
    value: any
  ) => {
    const updated = attributes.map((attr) => {
      if (attr.id === id) {
        const updatedAttr = { ...attr, [field]: value };

        // Auto-generate attribute_key from label if label changes
        if (field === 'label' && value) {
          updatedAttr.attribute_key = value
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_');
        }

        return updatedAttr;
      }
      return attr;
    });
    onChange(updated);
  };

  const renderValueInput = (attr: ResourceCustomAttribute) => {
    switch (attr.attribute_type) {
      case 'text':
        return (
          <Input
            placeholder='Enter value'
            value={(attr.value as string) || ''}
            onChange={(e) => updateAttribute(attr.id, 'value', e.target.value)}
            disabled={disabled}
          />
        );

      case 'number':
        return (
          <Input
            type='number'
            placeholder='Enter number'
            value={(attr.value as number) || ''}
            onChange={(e) =>
              updateAttribute(attr.id, 'value', parseFloat(e.target.value) || '')
            }
            disabled={disabled}
          />
        );

      case 'date':
        return (
          <Input
            type='date'
            value={(attr.value as string) || ''}
            onChange={(e) => updateAttribute(attr.id, 'value', e.target.value)}
            disabled={disabled}
          />
        );

      case 'boolean':
        return (
          <div className='flex items-center space-x-2 pt-2'>
            <Checkbox
              id={`value-${attr.id}`}
              checked={(attr.value as boolean) || false}
              onCheckedChange={(checked) =>
                updateAttribute(attr.id, 'value', checked)
              }
              disabled={disabled}
            />
            <Label htmlFor={`value-${attr.id}`} className='font-normal'>
              Yes
            </Label>
          </div>
        );

      case 'dropdown':
        return (
          <Select
            value={(attr.value as string) || ''}
            onValueChange={(value) => updateAttribute(attr.id, 'value', value)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder='Select option' />
            </SelectTrigger>
            <SelectContent>
              {attr.options?.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'textarea':
        return (
          <Textarea
            placeholder='Enter long text'
            value={(attr.value as string) || ''}
            onChange={(e) => updateAttribute(attr.id, 'value', e.target.value)}
            disabled={disabled}
            rows={3}
          />
        );

      case 'email':
        return (
          <Input
            type='email'
            placeholder='Enter email'
            value={(attr.value as string) || ''}
            onChange={(e) => updateAttribute(attr.id, 'value', e.target.value)}
            disabled={disabled}
          />
        );

      case 'url':
        return (
          <Input
            type='url'
            placeholder='Enter URL'
            value={(attr.value as string) || ''}
            onChange={(e) => updateAttribute(attr.id, 'value', e.target.value)}
            disabled={disabled}
          />
        );

      default:
        return (
          <Input
            placeholder='Enter value'
            value={(attr.value as string) || ''}
            onChange={(e) => updateAttribute(attr.id, 'value', e.target.value)}
            disabled={disabled}
          />
        );
    }
  };

  return (
    <div className='space-y-4'>
      {attributes.length === 0 ? (
        <div className='text-center py-8 text-muted-foreground'>
          <p>No custom attributes defined yet.</p>
          <p className='text-sm'>
            Click &quot;Add Attribute&quot; to create your first custom attribute.
          </p>
        </div>
      ) : (
        <div className='space-y-4'>
          {attributes.map((attr, index) => (
            <Card key={attr.id} className='p-4'>
              <div className='flex items-start justify-between mb-4'>
                <div className='flex items-center space-x-2'>
                  <GripVertical className='h-4 w-4 text-muted-foreground' />
                  <span className='text-sm font-medium'>
                    Attribute {index + 1}
                  </span>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() => removeAttribute(attr.id)}
                  disabled={disabled}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {/* Attribute Label */}
                <div>
                  <Label htmlFor={`attr-label-${attr.id}`}>
                    Attribute Label *
                  </Label>
                  <Input
                    id={`attr-label-${attr.id}`}
                    placeholder='e.g., RAM Size, Warranty Period'
                    value={attr.label}
                    onChange={(e) =>
                      updateAttribute(attr.id, 'label', e.target.value)
                    }
                    disabled={disabled}
                  />
                </div>

                {/* Attribute Key */}
                <div>
                  <Label htmlFor={`attr-key-${attr.id}`}>Attribute Key</Label>
                  <Input
                    id={`attr-key-${attr.id}`}
                    placeholder='Auto-generated from label'
                    value={attr.attribute_key}
                    onChange={(e) =>
                      updateAttribute(attr.id, 'attribute_key', e.target.value)
                    }
                    disabled={disabled}
                  />
                </div>

                {/* Data Type */}
                <div>
                  <Label htmlFor={`attr-type-${attr.id}`}>Data Type</Label>
                  <Select
                    value={attr.attribute_type}
                    onValueChange={(value: AttributeType) =>
                      updateAttribute(attr.id, 'attribute_type', value)
                    }
                    disabled={disabled}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ATTRIBUTE_TYPE.TEXT}>Text</SelectItem>
                      <SelectItem value={ATTRIBUTE_TYPE.NUMBER}>
                        Number
                      </SelectItem>
                      <SelectItem value={ATTRIBUTE_TYPE.DATE}>Date</SelectItem>
                      <SelectItem value={ATTRIBUTE_TYPE.BOOLEAN}>
                        Yes/No
                      </SelectItem>
                      <SelectItem value={ATTRIBUTE_TYPE.DROPDOWN}>
                        Dropdown
                      </SelectItem>
                      <SelectItem value={ATTRIBUTE_TYPE.TEXTAREA}>
                        Long Text
                      </SelectItem>
                      <SelectItem value={ATTRIBUTE_TYPE.EMAIL}>
                        Email
                      </SelectItem>
                      <SelectItem value={ATTRIBUTE_TYPE.URL}>URL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Default Value */}
                <div>
                  <Label htmlFor={`attr-default-${attr.id}`}>
                    Default Value
                  </Label>
                  <Input
                    id={`attr-default-${attr.id}`}
                    placeholder='Optional default value'
                    value={attr.default_value || ''}
                    onChange={(e) =>
                      updateAttribute(attr.id, 'default_value', e.target.value)
                    }
                    disabled={disabled}
                  />
                </div>
              </div>

              {/* Dropdown Options */}
              {attr.attribute_type === 'dropdown' && (
                <div className='mt-4'>
                  <Label htmlFor={`attr-options-${attr.id}`}>
                    Dropdown Options
                  </Label>
                  <Input
                    id={`attr-options-${attr.id}`}
                    placeholder='Enter options separated by commas'
                    value={attr.options?.join(', ') || ''}
                    onChange={(e) =>
                      updateAttribute(
                        attr.id,
                        'options',
                        e.target.value
                          .split(',')
                          .map((opt) => opt.trim())
                          .filter(Boolean)
                      )
                    }
                    disabled={disabled}
                  />
                </div>
              )}

              {/* Description */}
              <div className='mt-4'>
                <Label htmlFor={`attr-desc-${attr.id}`}>
                  Description (Help Text)
                </Label>
                <Textarea
                  id={`attr-desc-${attr.id}`}
                  placeholder='Optional description or help text'
                  value={attr.description || ''}
                  onChange={(e) =>
                    updateAttribute(attr.id, 'description', e.target.value)
                  }
                  disabled={disabled}
                  rows={2}
                />
              </div>

              {/* Required Switch */}
              <div className='flex items-center space-x-2 mt-4'>
                <Switch
                  id={`attr-required-${attr.id}`}
                  checked={attr.is_required}
                  onCheckedChange={(checked) =>
                    updateAttribute(attr.id, 'is_required', checked)
                  }
                  disabled={disabled}
                />
                <Label htmlFor={`attr-required-${attr.id}`}>
                  Required Field
                </Label>
              </div>

              {/* Current Value */}
              <div className='mt-4'>
                <Label>Current Value</Label>
                <div className='mt-2'>{renderValueInput(attr)}</div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={addAttribute}
        disabled={disabled}
        className='w-full'
      >
        <Plus className='mr-2 h-4 w-4' />
        Add Custom Attribute
      </Button>
    </div>
  );
}
