// app/(routes)/resource-management/resources/[id]/_components/custom-attributes-tab.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Settings, CheckCircle2, XCircle } from 'lucide-react';
import type { Resource } from '@/types/resource-management';

interface CustomAttributesTabProps {
  resource: Resource;
}

export function CustomAttributesTab({ resource }: CustomAttributesTabProps) {
  const customAttributes = resource.custom_attributes || {};
  const attributeDefinitions =
    resource.subcategory?.attribute_definitions || [];

  if (attributeDefinitions.length === 0) {
    return (
      <Card>
        <CardContent className='py-12 text-center'>
          <Settings className='h-12 w-12 mx-auto mb-4 text-muted-foreground' />
          <h3 className='text-lg font-semibold mb-2'>No Custom Attributes</h3>
          <p className='text-muted-foreground'>
            This sub-category has no custom attributes defined
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderAttributeValue = (attr: any) => {
    const value = customAttributes[attr.attribute_key];

    if (value === null || value === undefined || value === '') {
      return <span className='text-muted-foreground italic'>Not set</span>;
    }

    switch (attr.attribute_type) {
      case 'boolean':
        return value ? (
          <div className='flex items-center gap-2'>
            <CheckCircle2 className='h-4 w-4 text-green-600' />
            <span>Yes</span>
          </div>
        ) : (
          <div className='flex items-center gap-2'>
            <XCircle className='h-4 w-4 text-red-600' />
            <span>No</span>
          </div>
        );

      case 'multi_select':
        return (
          <div className='flex flex-wrap gap-2'>
            {Array.isArray(value) ? (
              value.map((v: string, i: number) => (
                <Badge key={i} variant='secondary'>
                  {v}
                </Badge>
              ))
            ) : (
              <span className='text-muted-foreground italic'>
                No items selected
              </span>
            )}
          </div>
        );

      case 'date':
        return new Date(value).toLocaleDateString();

      case 'number':
        return <span className='font-mono'>{value}</span>;

      default:
        return <span>{value}</span>;
    }
  };

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      {attributeDefinitions.map((attr: any) => (
        <Card key={attr.id}>
          <CardHeader>
            <div className='flex items-start justify-between'>
              <div>
                <CardTitle className='text-base'>
                  {attr.attribute_key
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </CardTitle>
                {attr.description && (
                  <p className='text-sm text-muted-foreground mt-1'>
                    {attr.description}
                  </p>
                )}
              </div>
              <div className='flex gap-2'>
                {attr.is_required && (
                  <Badge variant='destructive' className='text-xs'>
                    Required
                  </Badge>
                )}
                {attr.is_multiple && (
                  <Badge variant='secondary' className='text-xs'>
                    Multiple
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='space-y-2'>
              <div className='text-sm text-muted-foreground'>
                Type: <span className='font-medium'>{attr.attribute_type}</span>
              </div>

              <div className='rounded-lg border bg-muted/50 p-3'>
                <p className='text-sm font-medium mb-1'>Value:</p>
                <div className='text-base'>{renderAttributeValue(attr)}</div>
              </div>

              {attr.default_value && (
                <div className='text-xs text-muted-foreground'>
                  Default: {attr.default_value}
                </div>
              )}

              {attr.options && attr.options.length > 0 && (
                <div className='text-xs text-muted-foreground'>
                  Options: {attr.options.join(', ')}
                </div>
              )}

              {attr.validation_rules && (
                <div className='text-xs text-muted-foreground'>
                  Validation: {JSON.stringify(attr.validation_rules)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
