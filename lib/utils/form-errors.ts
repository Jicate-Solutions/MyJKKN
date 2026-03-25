import type { FieldErrors, FieldValues } from 'react-hook-form';

export function getFirstErrorField<TFieldValues extends FieldValues>(
  errors: FieldErrors<TFieldValues>,
  fieldOrder: Array<keyof TFieldValues>
): keyof TFieldValues | undefined {
  for (const field of fieldOrder) {
    const fieldError = errors[field as keyof FieldErrors<TFieldValues>];
    if (fieldError) {
      return field;
    }
  }

  const fallbackKey = Object.keys(errors)[0];
  return fallbackKey ? (fallbackKey as keyof TFieldValues) : undefined;
}
