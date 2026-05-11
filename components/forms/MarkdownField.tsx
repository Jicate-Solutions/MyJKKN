'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';

interface MarkdownFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  placeholder?: string;
  rows?: number;
}

export function MarkdownField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  placeholder,
  rows = 8,
}: MarkdownFieldProps<T>) {
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'edit' | 'preview')}>
            <TabsList className="mb-2">
              <TabsTrigger value="edit">Edit</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="edit">
              <FormControl>
                <Textarea
                  rows={rows}
                  placeholder={placeholder ?? 'Markdown supported (bold, lists, links).'}
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
            </TabsContent>
            <TabsContent value="preview">
              <div className="prose prose-sm max-w-none rounded-md border p-3 min-h-[8rem]">
                {field.value ? (
                  <ReactMarkdown>{String(field.value)}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground text-sm italic">
                    Nothing to preview yet.
                  </p>
                )}
              </div>
            </TabsContent>
          </Tabs>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
