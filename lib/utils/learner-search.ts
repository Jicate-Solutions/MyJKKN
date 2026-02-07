interface LearnerSearchOptions {
  caseSensitive?: boolean;
  exactMatch?: boolean;
  searchFields?: string[];
}

function normalizeSearchField(field: string): string | null {
  const trimmed = field.trim();
  if (!trimmed) return null;

  switch (trimmed) {
    case 'name':
      return 'name';
    case 'roll':
    case 'roll_number':
    case 'rollNumber':
      return 'roll';
    case 'email':
    case 'college_email':
    case 'collegeEmail':
      return 'email';
    case 'application':
    case 'application_id':
    case 'applicationId':
      return 'application_id';
    default:
      return null;
  }
}

function buildCondition(
  column: string,
  value: string,
  options: LearnerSearchOptions
) {
  const likeOperator = options.caseSensitive ? 'like' : 'ilike';

  if (options.exactMatch) {
    return options.caseSensitive
      ? `${column}.eq.${value}`
      : `${column}.ilike.${value}`;
  }

  return `${column}.${likeOperator}.%${value}%`;
}

function buildFieldConditions(
  field: string,
  value: string,
  options: LearnerSearchOptions
) {
  switch (field) {
    case 'name':
      return [
        buildCondition('first_name', value, options),
        buildCondition('last_name', value, options)
      ];
    case 'roll':
      return [buildCondition('roll_number', value, options)];
    case 'email':
      return [buildCondition('college_email', value, options)];
    case 'application_id':
      return [buildCondition('application_id', value, options)];
    default:
      return [];
  }
}

export function buildLearnerSearchConditions(
  search: string,
  options: LearnerSearchOptions = {}
): string[] {
  const trimmedSearch = search.trim();
  if (!trimmedSearch) return [];

  const enabledFields =
    options.searchFields && options.searchFields.length > 0
      ? new Set(
          options.searchFields
            .map((field) => normalizeSearchField(field))
            .filter((field): field is string => Boolean(field))
        )
      : null;

  const conditions: string[] = [];

  if (trimmedSearch.includes('|') || trimmedSearch.includes(':')) {
    const parts = trimmedSearch.split('|');

    for (const part of parts) {
      const separatorIndex = part.indexOf(':');
      if (separatorIndex === -1) continue;

      const rawField = part.slice(0, separatorIndex);
      const rawValue = part.slice(separatorIndex + 1);
      const field = normalizeSearchField(rawField);
      const value = rawValue.trim();

      if (!field || !value) continue;
      if (enabledFields && !enabledFields.has(field)) continue;

      conditions.push(...buildFieldConditions(field, value, options));
    }

    return conditions;
  }

  const fallbackFields = enabledFields
    ? Array.from(enabledFields)
    : ['name', 'roll', 'email', 'application_id'];

  for (const field of fallbackFields) {
    conditions.push(...buildFieldConditions(field, trimmedSearch, options));
  }

  return conditions;
}
