'use client';

import { useState } from 'react';
import moment from 'moment';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import {
  useCalendarEntries, useCalendarCategories,
  useCreateCalendarEntry, useUpdateCalendarEntry, useDeleteCalendarEntry,
} from '@/hooks/calendar/use-calendar';
import { getErrorMessage } from '@/lib/utils';
import type { CalendarEntry, CalendarEntryKind } from '@/types/calendar';

interface FormState {
  id?: string;
  kind: CalendarEntryKind;
  title: string;
  description: string;
  category_id: string;
  start_date: string;
  end_date: string;
  blocks_attendance: boolean;
  scope: 'all' | 'specific';
  scope_institution_ids: string[];
}

const EMPTY: FormState = {
  kind: 'holiday', title: '', description: '', category_id: '',
  start_date: moment().format('YYYY-MM-DD'), end_date: moment().format('YYYY-MM-DD'),
  blocks_attendance: true, scope: 'all', scope_institution_ids: [],
};

export function HolidaysAdmin() {
  const { toast } = useToast();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage = isSuperAdmin || canAccess('calendar.holidays', 'manage');

  const [search, setSearch] = useState('');
  const { data: list, isLoading } = useCalendarEntries({ search });
  const { data: categories = [] } = useCalendarCategories();
  const { institutions } = useInstitutionsWithAccess({ isActive: true, entityType: 'all' });

  const create = useCreateCalendarEntry();
  const update = useUpdateCalendarEntry();
  const remove = useDeleteCalendarEntry();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);

  const entries = list?.data ?? [];

  const openCreate = () => { setForm(EMPTY); setOpen(true); };
  const openEdit = (e: CalendarEntry) => {
    setForm({
      id: e.id, kind: e.kind, title: e.title, description: e.description ?? '',
      category_id: e.category_id ?? '',
      start_date: moment(e.start_at).format('YYYY-MM-DD'),
      end_date: moment(e.end_at).format('YYYY-MM-DD'),
      blocks_attendance: e.blocks_attendance,
      scope: e.scope_institution_ids && e.scope_institution_ids.length ? 'specific' : 'all',
      scope_institution_ids: e.scope_institution_ids ?? [],
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    const payload = {
      kind: form.kind,
      title: form.title.trim(),
      description: form.description || null,
      category_id: form.category_id || null,
      start_at: moment(form.start_date).startOf('day').toISOString(),
      end_at: moment(form.end_date).endOf('day').toISOString(),
      all_day: true,
      blocks_attendance: form.kind === 'holiday' ? form.blocks_attendance : false,
      scope_institution_ids: form.scope === 'all' ? null : form.scope_institution_ids,
    };
    try {
      if (form.id) await update.mutateAsync({ id: form.id, updates: payload });
      else await create.mutateAsync(payload);
      toast({ title: form.id ? 'Entry updated' : 'Entry created' });
      setOpen(false);
    } catch (err) {
      toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const del = async (e: CalendarEntry) => {
    try {
      await remove.mutateAsync(e.id);
      toast({ title: 'Entry deleted' });
    } catch (err) {
      toast({ title: 'Delete failed', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const scopeLabel = (e: CalendarEntry) =>
    e.scope_institution_ids && e.scope_institution_ids.length
      ? `${e.scope_institution_ids.length} institution(s)`
      : 'All institutions';

  const toggleInstitution = (id: string) =>
    setForm((f) => ({
      ...f,
      scope_institution_ids: f.scope_institution_ids.includes(id)
        ? f.scope_institution_ids.filter((x) => x !== id)
        : [...f.scope_institution_ids, id],
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Common Holidays &amp; Events</h1>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openCreate}>New entry</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{form.id ? 'Edit' : 'New'} entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Kind</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as CalendarEntryKind }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="event">Event</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title</Label>
                  <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Start date</Label>
                    <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>End date</Label>
                    <Input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={form.category_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v === 'none' ? '' : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— none —</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Scope</Label>
                  <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v as 'all' | 'specific' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All institutions (common)</SelectItem>
                      <SelectItem value="specific">Specific institutions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.scope === 'specific' && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
                    {institutions.map((inst) => (
                      <label key={inst.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.scope_institution_ids.includes(inst.id)}
                          onChange={() => toggleInstitution(inst.id)}
                        />
                        {inst.name}
                      </label>
                    ))}
                  </div>
                )}
                {form.kind === 'holiday' && (
                  <div className="flex items-center justify-between">
                    <Label>Blocks attendance</Label>
                    <Switch checked={form.blocks_attendance} onCheckedChange={(v) => setForm((f) => ({ ...f, blocks_attendance: v }))} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={create.isPending || update.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Input placeholder="Search title/description…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Blocks attendance</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6}>Loading…</TableCell></TableRow>}
            {!isLoading && entries.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-muted-foreground">No entries.</TableCell></TableRow>
            )}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.title}</TableCell>
                <TableCell className="capitalize">{e.kind}</TableCell>
                <TableCell>{moment(e.start_at).format('DD MMM YYYY')} – {moment(e.end_at).format('DD MMM YYYY')}</TableCell>
                <TableCell>{scopeLabel(e)}</TableCell>
                <TableCell>{e.kind === 'holiday' ? (e.blocks_attendance ? 'Yes' : 'No') : '—'}</TableCell>
                {canManage && (
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(e)}>Edit</Button>
                    <Button size="sm" variant="destructive" onClick={() => del(e)}>Delete</Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
