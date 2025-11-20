// app/(routes)/resource-management/resources/[id]/_components/custom-attributes-tab.tsx

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Settings, CheckCircle2, XCircle } from 'lucide-react';
import type { Resource, ResourceCustomAttributesData } from '@/types/resource-management';

interface CustomAttributesTabProps {
  resource: Resource;
}

export function CustomAttributesTab({ resource }: CustomAttributesTabProps) {
  // Parse custom attributes from the new JSONB structure
  const customAttributesData = resource.custom_attributes as ResourceCustomAttributesData | null;
  const attributeDefinitions = customAttributesData?.schema || [];
  const attributeValues = customAttributesData?.values || {};

  if (attributeDefinitions.length === 0) {
    return (
      <Card>
        <CardContent className='py-12 text-center'>
          <Settings className='h-12 w-12 mx-auto mb-4 text-muted-foreground' />
          <h3 className='text-lg font-semibold mb-2'>No Custom Attributes</h3>
          <p className='text-muted-foreground'>
            This resource has no custom attributes defined
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderAttributeValue = (attr: any) => {
    const value = attributeValues[attr.attribute_key];

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

      case 'dropdown':
        return (
          <Badge variant='secondary' className='font-normal'>
            {value}
          </Badge>
        );

      case 'date':
        return new Date(value).toLocaleDateString();

      case 'number':
        return <span className='font-mono'>{value}</span>;

      case 'email':
        return (
          <a
            href={`mailto:${value}`}
            className='text-blue-600 hover:underline'
          >
            {value}
          </a>
        );

      case 'url':
        return (
          <a
            href={value}
            target='_blank'
            rel='noopener noreferrer'
            className='text-blue-600 hover:underline'
          >
            {value}
          </a>
        );

      case 'textarea':
        return <p className='whitespace-pre-wrap'>{value}</p>;

      default:
        return <span>{value}</span>;
    }
  };

  return (
    <div className='grid gap-6 md:grid-cols-2'>
      {attributeDefinitions.map((attr: any, index: number) => (
        <Card key={attr.id || index}>
          <CardHeader>
            <div className='flex items-start justify-between'>
              <div>
                <CardTitle className='text-base'>
                  {attr.label}
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
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className='space-y-2'>
              <div className='text-sm text-muted-foreground'>
                Type: <span className='font-medium capitalize'>{attr.attribute_type}</span>
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
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
