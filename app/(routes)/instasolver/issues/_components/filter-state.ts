// URL <-> IssueFilters for the issue list. The URL is the source of truth so a
// filtered list can be shared and survives a refresh.

import { ISSUE_STATUS_VALUES, PAGE_SIZE, SEVERITY_VALUES } from '@/lib/instasolver/constants';
import type { IssueFilters, IssueScope, IssueStatus, Severity } from '@/types/instasolver';

const SCOPES: IssueScope[] = ['all', 'mine', 'assigned_to_me', 'my_teams'];

function list<T extends string>(raw: string | null, allowed: readonly T[]): T[] | undefined {
  if (!raw) return undefined;
  const out = raw.split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
  return out.length ? out : undefined;
}

export function parseFilters(params: URLSearchParams): IssueFilters {
  const scope = params.get('scope') as IssueScope | null;
  const category = Number(params.get('category'));
  const page = Number(params.get('page'));
  return {
    search: params.get('q') || undefined,
    status: list<IssueStatus>(params.get('status'), ISSUE_STATUS_VALUES),
    severity: list<Severity>(params.get('severity'), SEVERITY_VALUES),
    institution_id: params.get('institution') || undefined,
    category_id: Number.isFinite(category) && category > 0 ? category : undefined,
    scope: scope && SCOPES.includes(scope) ? scope : undefined,
    unassigned: params.get('unassigned') === '1' || undefined,
    disputed: params.get('disputed') === '1' || undefined,
    page: Number.isFinite(page) && page > 1 ? page : 1,
    limit: PAGE_SIZE
  };
}

export function toParams(f: IssueFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set('q', f.search);
  if (f.status?.length) p.set('status', f.status.join(','));
  if (f.severity?.length) p.set('severity', f.severity.join(','));
  if (f.institution_id) p.set('institution', f.institution_id);
  if (f.category_id) p.set('category', String(f.category_id));
  if (f.scope && f.scope !== 'all') p.set('scope', f.scope);
  if (f.unassigned) p.set('unassigned', '1');
  if (f.disputed) p.set('disputed', '1');
  if (f.page && f.page > 1) p.set('page', String(f.page));
  return p;
}

export function hasActiveFilters(f: IssueFilters): boolean {
  return !!(
    f.search ||
    f.status?.length ||
    f.severity?.length ||
    f.institution_id ||
    f.category_id ||
    (f.scope && f.scope !== 'all') ||
    f.unassigned ||
    f.disputed
  );
}

const storageKey = (userId: string) => `instasolver:issues:filters:${userId}`;

export function loadStoredFilters(userId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function storeFilters(userId: string, query: string): void {
  try {
    // The page number is not a preference; only remember the filters.
    const p = new URLSearchParams(query);
    p.delete('page');
    if (p.toString()) window.localStorage.setItem(storageKey(userId), p.toString());
    else window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* storage unavailable — the URL still carries the state */
  }
}
