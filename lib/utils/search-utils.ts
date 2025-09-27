import { Staff } from '@/types/staff';

export interface SearchOptions {
  searchFields: {
    name: boolean;
    email: boolean;
    institutionEmail: boolean;
    staffId: boolean;
    designation: boolean;
  };
  caseSensitive: boolean;
  exactMatch: boolean;
}

/**
 * Normalizes text for searching by removing diacritics and handling case
 */
function normalizeText(text: string, caseSensitive: boolean = false): string {
  if (!text) return '';

  let normalized = text.toString().trim();

  if (!caseSensitive) {
    normalized = normalized.toLowerCase();
  }

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, ' ');

  return normalized;
}

/**
 * Checks if a search term matches a target string based on options
 */
function matchesSearchTerm(
  target: string,
  searchTerm: string,
  options: Pick<SearchOptions, 'caseSensitive' | 'exactMatch'>
): boolean {
  if (!target || !searchTerm) return false;

  const normalizedTarget = normalizeText(target, options.caseSensitive);
  const normalizedSearch = normalizeText(searchTerm, options.caseSensitive);

  if (options.exactMatch) {
    return normalizedTarget === normalizedSearch;
  }

  return normalizedTarget.includes(normalizedSearch);
}

/**
 * Gets searchable text from staff member based on enabled fields
 */
function getSearchableFields(staff: Staff, searchFields: SearchOptions['searchFields']): string[] {
  const fields: string[] = [];

  if (searchFields.name) {
    fields.push(staff.first_name || '');
    fields.push(staff.last_name || '');
    fields.push(`${staff.first_name || ''} ${staff.last_name || ''}`.trim());
  }

  if (searchFields.email && staff.email) {
    fields.push(staff.email);
  }

  if (searchFields.institutionEmail && staff.institution_email) {
    fields.push(staff.institution_email);
  }

  if (searchFields.staffId && staff.staff_id) {
    fields.push(staff.staff_id);
  }

  if (searchFields.designation && staff.designation) {
    fields.push(staff.designation);
  }

  // Also include institution name if available
  if (staff.institution?.name) {
    fields.push(staff.institution.name);
  }

  // Include department name if available
  if (staff.department?.department_name) {
    fields.push(staff.department.department_name);
  }

  return fields.filter(Boolean);
}

/**
 * Searches staff members efficiently with highlighting information
 */
export function searchStaffMembers(
  staffList: Staff[],
  query: string,
  options: SearchOptions
): {
  results: Staff[];
  highlightInfo: Map<string, string[]>;
  totalResults: number;
} {
  if (!query.trim()) {
    return {
      results: staffList,
      highlightInfo: new Map(),
      totalResults: staffList.length,
    };
  }

  const searchTerms = query.trim().split(/\s+/);
  const highlightInfo = new Map<string, string[]>();

  const results = staffList.filter((staff) => {
    const searchableFields = getSearchableFields(staff, options.searchFields);
    const matchedFields: string[] = [];

    // Check if all search terms match at least one field
    const allTermsMatch = searchTerms.every((term) =>
      searchableFields.some((field) => {
        const matches = matchesSearchTerm(field, term, options);
        if (matches && !matchedFields.includes(field)) {
          matchedFields.push(field);
        }
        return matches;
      })
    );

    if (allTermsMatch && matchedFields.length > 0) {
      highlightInfo.set(staff.id, matchedFields);
      return true;
    }

    return false;
  });

  return {
    results,
    highlightInfo,
    totalResults: results.length,
  };
}

/**
 * Highlights search terms in text
 */
export function highlightSearchTerms(
  text: string,
  searchTerms: string[],
  options: Pick<SearchOptions, 'caseSensitive' | 'exactMatch'>
): string {
  if (!text || !searchTerms.length) return text;

  let highlightedText = text;

  searchTerms.forEach((term) => {
    if (!term.trim()) return;

    const normalizedTerm = normalizeText(term, options.caseSensitive);
    const flags = options.caseSensitive ? 'g' : 'gi';

    let pattern: RegExp;
    if (options.exactMatch) {
      pattern = new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, flags);
    } else {
      pattern = new RegExp(escapeRegExp(normalizedTerm), flags);
    }

    highlightedText = highlightedText.replace(pattern, '<mark>$&</mark>');
  });

  return highlightedText;
}

/**
 * Escapes special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Debounce function for search optimization
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}