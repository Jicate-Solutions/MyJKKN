import type { StaffFilters } from '@/types/staff';

interface StaffSearchFields {
  nameQuery?: string;
  emailQuery?: string;
  institutionEmailQuery?: string;
  staffIdQuery?: string;
  designationQuery?: string;
}

export interface StaffSearchFieldToggles {
  name: boolean;
  email: boolean;
  institutionEmail: boolean;
  staffId: boolean;
  designation: boolean;
}

interface StaffSearchOptions {
  caseSensitive?: boolean;
  exactMatch?: boolean;
  searchFields?: string[];
}

interface StaffUserProfile {
  role: string;
  institution_id?: string;
}

export function buildStaffSearchQuery(
  fields: StaffSearchFields,
  searchFields?: StaffSearchFieldToggles
): string {
  const parts: string[] = [];

  if (searchFields?.name !== false && fields.nameQuery?.trim()) {
    parts.push(`name:${fields.nameQuery.trim()}`);
  }

  if (searchFields?.email !== false && fields.emailQuery?.trim()) {
    parts.push(`email:${fields.emailQuery.trim()}`);
  }

  if (
    searchFields?.institutionEmail !== false &&
    fields.institutionEmailQuery?.trim()
  ) {
    parts.push(`institution_email:${fields.institutionEmailQuery.trim()}`);
  }

  if (searchFields?.staffId !== false && fields.staffIdQuery?.trim()) {
    parts.push(`staff_id:${fields.staffIdQuery.trim()}`);
  }

  if (searchFields?.designation !== false && fields.designationQuery?.trim()) {
    parts.push(`designation:${fields.designationQuery.trim()}`);
  }

  return parts.join('|');
}

export function buildStaffSearchConditions(
  search: string,
  options: StaffSearchOptions = {}
): string[] {
  const trimmedSearch = search.trim();
  if (!trimmedSearch) return [];

  const likeOperator = options.caseSensitive ? 'like' : 'ilike';
  const buildCondition = (column: string, value: string) => {
    if (options.exactMatch) {
      return options.caseSensitive
        ? `${column}.eq.${value}`
        : `${column}.ilike.${value}`;
    }

    return `${column}.${likeOperator}.%${value}%`;
  };

  const enabledFields =
    options.searchFields && options.searchFields.length > 0
      ? new Set(options.searchFields)
      : null;

  const conditions: string[] = [];

  if (trimmedSearch.includes('|') || trimmedSearch.includes(':')) {
    const parts = trimmedSearch.split('|');

    for (const part of parts) {
      const [field, rawValue] = part.split(':');
      if (!field || !rawValue) continue;
      const value = rawValue.trim();
      if (!value) continue;

      if (enabledFields && !enabledFields.has(field)) continue;

      switch (field) {
        case 'name':
          conditions.push(buildCondition('first_name', value));
          conditions.push(buildCondition('last_name', value));
          break;
        case 'email':
          conditions.push(buildCondition('email', value));
          break;
        case 'institution_email':
          conditions.push(buildCondition('institution_email', value));
          break;
        case 'staff_id':
          conditions.push(buildCondition('staff_id', value));
          break;
        case 'designation':
          conditions.push(buildCondition('designation', value));
          break;
        default:
          break;
      }
    }

    return conditions;
  }

  const defaultFields = [
    'name',
    'email',
    'institution_email',
    'staff_id',
    'designation'
  ];

  for (const field of defaultFields) {
    if (enabledFields && !enabledFields.has(field)) continue;

    switch (field) {
      case 'name':
        conditions.push(buildCondition('first_name', trimmedSearch));
        conditions.push(buildCondition('last_name', trimmedSearch));
        break;
      case 'email':
        conditions.push(buildCondition('email', trimmedSearch));
        break;
      case 'institution_email':
        conditions.push(buildCondition('institution_email', trimmedSearch));
        break;
      case 'staff_id':
        conditions.push(buildCondition('staff_id', trimmedSearch));
        break;
      case 'designation':
        conditions.push(buildCondition('designation', trimmedSearch));
        break;
      default:
        break;
    }
  }

  return conditions;
}

export function resolveStaffFiltersForUser(
  filters: StaffFilters,
  userProfile?: StaffUserProfile
): StaffFilters {
  if (userProfile?.role !== 'hod' || !userProfile.institution_id) {
    return { ...filters };
  }

  return {
    ...filters,
    institution_id: userProfile.institution_id
  };
}
