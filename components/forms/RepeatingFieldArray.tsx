'use client';

import { ReactNode } from 'react';
import {
  useFieldArray,
  type Control,
  type FieldValues,
  type FieldPath,
  type ArrayPath,
} from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface RepeatingFieldArrayProps<T extends FieldValues, TItem> {
  control: Control<T>;
  name: ArrayPath<T>;
  label: string;
  itemLabel: (item: TItem, index: number) => string;
  defaultItem: TItem;
  renderItem: (basePath: FieldPath<T>, index: number) => ReactNode;
  emptyMessage?: string;
  addLabel?: string;
}

export function RepeatingFieldArray<T extends FieldValues, TItem>({
  control,
  name,
  label,
  itemLabel,
  defaultItem,
  renderItem,
  emptyMessage = 'No entries yet.',
  addLabel = 'Add entry',
}: RepeatingFieldArrayProps<T, TItem>) {
  const { fields, append, remove } = useFieldArray({ control, name });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{label}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append(defaultItem as never)}
        >
          <Plus className="mr-1 h-4 w-4" />
          {addLabel}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">{emptyMessage}</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {fields.map((f, index) => (
            <AccordionItem
              key={f.id}
              value={`item-${index}`}
              className="border rounded-md px-3"
            >
              <div className="flex items-center justify-between">
                <AccordionTrigger className="flex-1 text-left">
                  {itemLabel(f as unknown as TItem, index) || `Entry ${index + 1}`}
                </AccordionTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(index);
                  }}
                  aria-label={`Remove entry ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <AccordionContent className="pt-3">
                {renderItem(`${name}.${index}` as FieldPath<T>, index)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
