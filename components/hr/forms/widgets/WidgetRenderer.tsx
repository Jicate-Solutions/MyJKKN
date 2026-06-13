/**
 * WidgetRenderer — dispatches a widget to its concrete renderer.
 *
 * Wave 3 — M9 follow-up (builder UI + per-widget renderers).
 *
 * Single entry point for both the submission renderer and the builder canvas.
 * The `readOnly` flag flips every widget into a preview state (no callbacks,
 * disabled inputs) so directors can see what their form looks like inside the
 * builder before publishing.
 */
'use client';

import type { Widget } from '@/types/hr-forms';

import { CheckboxWidget } from './CheckboxWidget';
import { ConditionalLogicWrapper, evaluateConditional } from './ConditionalLogicWrapper';
import { DateWidget } from './DateWidget';
import { DropdownWidget } from './DropdownWidget';
import { FileUploadWidget } from './FileUploadWidget';
import { NumberWidget } from './NumberWidget';
import { RadioWidget } from './RadioWidget';
import { SignatureWidget } from './SignatureWidget';
import { TextareaWidget } from './TextareaWidget';
import { TextWidget } from './TextWidget';

interface WidgetRendererProps {
  widget: Widget;
  /** Map of widget.id → value for the current submission. */
  values: Record<string, unknown>;
  /** Update one widget's answer. Ignored in readOnly. */
  onChange?: (widgetId: string, next: unknown) => void;
  readOnly?: boolean;
}

export function WidgetRenderer({
  widget,
  values,
  onChange,
  readOnly,
}: WidgetRendererProps) {
  // Conditional gating — applies to every widget via visible_when.
  if (!evaluateConditional(widget.visible_when, values)) return null;

  const value = values[widget.id];
  const change = (next: unknown) => onChange?.(widget.id, next);

  switch (widget.type) {
    case 'text':
      return (
        <TextWidget
          widget={widget}
          value={value as string | undefined}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'textarea':
      return (
        <TextareaWidget
          widget={widget}
          value={value as string | undefined}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'number':
      return (
        <NumberWidget
          widget={widget}
          value={(value as number | '' | undefined) ?? ''}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'date':
      return (
        <DateWidget
          widget={widget}
          value={value as string | undefined}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'dropdown':
      return (
        <DropdownWidget
          widget={widget}
          value={value as string | undefined}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'radio':
      return (
        <RadioWidget
          widget={widget}
          value={value as string | undefined}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'checkbox':
      return (
        <CheckboxWidget
          widget={widget}
          value={(value as string[] | undefined) ?? []}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'file_upload':
      return (
        <FileUploadWidget
          widget={widget}
          value={value as string | string[] | undefined}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'signature':
      return (
        <SignatureWidget
          widget={widget}
          value={value as string | undefined}
          onChange={change}
          readOnly={readOnly}
        />
      );
    case 'conditional': {
      const next = evaluateConditional(widget.expression, values)
        ? widget.true_widget
        : widget.false_widget;
      if (!next) return null;
      return (
        <ConditionalLogicWrapper expression={undefined} values={values}>
          <WidgetRenderer
            widget={next}
            values={values}
            onChange={onChange}
            readOnly={readOnly}
          />
        </ConditionalLogicWrapper>
      );
    }
    default: {
      // Exhaustive check — TypeScript will flag this if a new WidgetType is added.
      const _exhaustive: never = widget;
      return null;
    }
  }
}
