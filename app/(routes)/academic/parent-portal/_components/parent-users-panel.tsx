'use client';

/**
 * Parent Portal admin — Parent User Data subtab (super_admin / principal only).
 *
 * Two modes:
 *  - page-filter (super_admin / staff): driven by the page's shared targeting
 *    (institution + class/section/learner) — no own dropdown (avoids a duplicate
 *    filter).
 *  - standalone (principal, who can't load the staff-only content filter): shows
 *    its own institution dropdown scoped to their institution.
 *
 * Passwords (Director rulings 2 Oct 2026): there is no Password column and
 * none is exported; the list API never sends one. A SUPER ADMIN (only — the
 * server reports profiles.is_super_admin as viewerIsSuperAdmin) gets a per-row
 * "Show password" button. Each click goes to the show-password route, which
 * checks the flag again, records the view, and answers with the saved starting
 * password or "Changed by parent". The answer is kept in its own per-row state,
 * never in `users`, so it can never reach the Excel export.
 */
import { useCallback, useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Building2, Download, Eye, EyeOff, KeyRound, Loader2, LogOut, Search } from 'lucide-react';
import { SIGNED_OUT_EVERYWHERE_NOTICE } from '@/lib/auth/sign-out-everywhere-copy';
import {
  ParentPortalAdminService,
  type PPInstitution,
  type PPShownPassword,
  type PPTarget,
  type PPUserRow,
} from '@/lib/services/academic/parent-portal-admin-service';

/** Pre-filled in the Reset dialog only — never displayed as a stored value. */
const DEFAULT_PASSWORD = 'JKKN@100';

export const PARENT_SIGN_OUT_WARNING =
  'This signs the parent out on every phone and computer, including the one they are using now. They can sign in again with their password.';

export function ParentUsersPanel({
  target,
  institutionName,
  standalone = false,
}: {
  target?: PPTarget;
  institutionName?: string;
  standalone?: boolean;
}) {
  const [institutions, setInstitutions] = useState<PPInstitution[]>([]);
  const [ownInstitutionId, setOwnInstitutionId] = useState(''); // standalone only
  const [users, setUsers] = useState<PPUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // "Show password" — super admins only; each answer lives here, per account.
  const [viewerIsSuperAdmin, setViewerIsSuperAdmin] = useState(false);
  const [shown, setShown] = useState<Record<string, PPShownPassword | 'loading'>>({});

  const [resetRow, setResetRow] = useState<PPUserRow | null>(null);
  const [resetValue, setResetValue] = useState(DEFAULT_PASSWORD);
  const [saving, setSaving] = useState(false);

  // "Sign out of all devices" — shown only once the parent kill switch
  // (pp_parent_accounts.sessions_revoked_at) exists in the database.
  const [signOutAvailable, setSignOutAvailable] = useState(false);
  const [signOutRow, setSignOutRow] = useState<PPUserRow | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    ParentPortalAdminService.parentSignOutAvailable()
      .then((ok) => {
        if (!cancelled) setSignOutAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setSignOutAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Active institution + name for export filename.
  const activeInstitutionId = standalone ? ownInstitutionId : target?.institutionId ?? '';
  const activeInstitutionName = standalone
    ? institutions.find((i) => i.id === ownInstitutionId)?.name ?? ''
    : institutionName ?? '';

  const load = useCallback(
    async (instOverride?: string) => {
      const query = standalone
        ? { institutionId: instOverride ?? ownInstitutionId }
        : target;
      if (!standalone && !target?.institutionId) {
        setUsers([]);
        return;
      }
      setLoading(true);
      setShown({});
      try {
        // listParentUsers resolves to { ok, status, json } — the rows are in
        // .json. Reading r.users (always undefined) left this table empty.
        const r = await ParentPortalAdminService.listParentUsers(query);
        if (!r.ok) {
          throw new Error((r.json as { error?: string }).error || 'Failed to load parent users');
        }
        setUsers(r.json.users ?? []);
        setViewerIsSuperAdmin(r.json.viewerIsSuperAdmin === true);
        if (standalone) {
          setInstitutions(r.json.institutions ?? []);
          if (r.json.institutionId && !ownInstitutionId) setOwnInstitutionId(r.json.institutionId);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to load parent users');
      } finally {
        setLoading(false);
      }
    },
    [standalone, target, ownInstitutionId]
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standalone, target?.institutionId, target?.programIds, target?.sectionIds, target?.learnerIds]);

  const submitReset = async () => {
    if (!resetRow) return;
    if (resetValue.trim().length < 8) return toast.error('Password must be at least 8 characters.');
    setSaving(true);
    try {
      await ParentPortalAdminService.resetParentPassword(resetRow.accountId, resetValue.trim());
      toast.success(`Password reset for ${resetRow.learnerName}.`);
      setResetRow(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const showPassword = async (row: PPUserRow) => {
    setShown((m) => ({ ...m, [row.accountId]: 'loading' }));
    try {
      const answer = await ParentPortalAdminService.showParentPassword(row.accountId);
      setShown((m) => ({ ...m, [row.accountId]: answer }));
    } catch (e) {
      setShown((m) => {
        const next = { ...m };
        delete next[row.accountId];
        return next;
      });
      toast.error(e instanceof Error ? e.message : 'Could not show the password');
    }
  };

  const hidePassword = (accountId: string) =>
    setShown((m) => {
      const next = { ...m };
      delete next[accountId];
      return next;
    });

  const submitSignOut = async () => {
    if (!signOutRow) return;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await ParentPortalAdminService.signOutParentEverywhere(signOutRow.accountId);
      toast.success(`The parent of ${signOutRow.learnerName || 'this learner'}: ${SIGNED_OUT_EVERYWHERE_NOTICE}`);
      setSignOutRow(null);
    } catch (e) {
      setSignOutError(e instanceof Error ? e.message : 'Failed to sign the parent out');
    } finally {
      setSigningOut(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(
        (u) =>
          u.learnerName.toLowerCase().includes(q) ||
          u.rollNumber.toLowerCase().includes(q) ||
          u.fatherMobile.includes(q) ||
          u.motherMobile.includes(q)
      )
    : users;

  const exportExcel = () => {
    if (!filtered.length) return toast.error('Nothing to export.');
    const rows = filtered.map((u, i) => ({
      'S.No': i + 1,
      'Roll Number': u.rollNumber,
      'Learner Name': u.learnerName,
      'Father Mobile Number': u.fatherMobile,
      'Mother Mobile Number': u.motherMobile,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parent Users');
    XLSX.writeFile(wb, `${(activeInstitutionName || 'parent_users').replace(/[^\w]+/g, '_')}_parent_users.xlsx`);
  };

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {standalone && (
          <div className="space-y-1.5 sm:max-w-xs sm:flex-1">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Institution
            </Label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                value={ownInstitutionId}
                disabled={institutions.length <= 1}
                onChange={(e) => {
                  setOwnInstitutionId(e.target.value);
                  load(e.target.value);
                }}
                className="w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm shadow-sm focus:border-[#0b6d41] focus:outline-none focus:ring-1 focus:ring-[#0b6d41] disabled:opacity-60 dark:bg-neutral-900"
              >
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="relative sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, roll number or mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={exportExcel} variant="outline" className="gap-2">
          <Download className="h-4 w-4" /> Export Excel
        </Button>
      </div>

      {!activeInstitutionId ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Pick an institution {standalone ? 'above' : 'in the filter above'}.
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No parent accounts found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">S.No</th>
                <th className="px-3 py-2">Roll No</th>
                <th className="px-3 py-2">Learner</th>
                <th className="px-3 py-2">Father Mobile</th>
                <th className="px-3 py-2">Mother Mobile</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.accountId} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{u.rollNumber || '—'}</td>
                  <td className="px-3 py-2">{u.learnerName || '—'}</td>
                  <td className="px-3 py-2">{u.fatherMobile || '—'}</td>
                  <td className="px-3 py-2">{u.motherMobile || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {viewerIsSuperAdmin && (
                      <ShowPasswordCell
                        state={shown[u.accountId]}
                        onShow={() => showPassword(u)}
                        onHide={() => hidePassword(u.accountId)}
                      />
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-[#0b6d41]"
                      onClick={() => {
                        setResetRow(u);
                        setResetValue(DEFAULT_PASSWORD);
                      }}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Reset
                    </Button>
                    {signOutAvailable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-destructive"
                        onClick={() => {
                          setSignOutRow(u);
                          setSignOutError(null);
                        }}
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sign out of all devices
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!resetRow} onOpenChange={(o) => !o && setResetRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
          </DialogHeader>
          {resetRow && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Set a new password for{' '}
                <span className="font-medium text-foreground">{resetRow.learnerName}</span>
                {resetRow.rollNumber ? ` (${resetRow.rollNumber})` : ''}. The parent will use this to log in.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reset-pw">New password</Label>
                <Input
                  id="reset-pw"
                  value={resetValue}
                  onChange={(e) => setResetValue(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetRow(null)} disabled={saving}>
              Cancel
            </Button>
            <Button className="bg-[#0b6d41] hover:bg-[#0a5733]" onClick={submitReset} disabled={saving}>
              {saving ? 'Resetting…' : 'Reset password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!signOutRow} onOpenChange={(o) => !o && !signingOut && setSignOutRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out of all devices</DialogTitle>
          </DialogHeader>
          {signOutRow && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Parent of{' '}
                <span className="font-medium text-foreground">{signOutRow.learnerName || '—'}</span>
                {signOutRow.rollNumber ? ` (${signOutRow.rollNumber})` : ''}.
              </p>
              <p className="text-sm font-medium">{PARENT_SIGN_OUT_WARNING}</p>
              {signOutError && (
                <p role="alert" className="text-sm text-destructive">
                  {signOutError}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOutRow(null)} disabled={signingOut}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Yes, sign the parent out everywhere'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ShowPasswordCell({
  state,
  onShow,
  onHide,
}: {
  state: PPShownPassword | 'loading' | undefined;
  onShow: () => void;
  onHide: () => void;
}) {
  if (!state) {
    return (
      <Button size="sm" variant="ghost" className="gap-1" onClick={onShow}>
        <Eye className="h-3.5 w-3.5" /> Show password
      </Button>
    );
  }
  if (state === 'loading') {
    return (
      <span className="inline-flex items-center px-3 text-xs text-muted-foreground">
        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Checking…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      {'password' in state ? (
        <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-foreground">{state.password}</code>
      ) : (
        <span className="text-xs font-medium text-muted-foreground">Changed by parent</span>
      )}
      <Button size="sm" variant="ghost" className="gap-1" onClick={onHide} aria-label="Hide password">
        <EyeOff className="h-3.5 w-3.5" /> Hide
      </Button>
    </span>
  );
}
