'use client';

// Pre-session materials — Senior Learner control (Rank 3a). Lists the caller's
// recent sessions (the same source as the Live Pulse control) and, per session,
// lets them post a NotebookLM link/material and see how many learners opened it.
// The count is aggregate adoption only — never who. Authority is enforced
// server-side by fn_scf_post_session_resource (_fn_curriculum_class_ctx, manage),
// so a Senior Learner can only post for their own course's sessions. Posting for a
// truly-future slot that has no attendance yet is deferred to slice 3b (it needs a
// future-session source this module does not yet expose).

import { useState } from 'react';
import { BookOpen, ExternalLink, Loader2, Plus, Trash2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { BeatLoader } from 'react-spinners';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useFacultyCompletion,
  useSessionResources,
  usePostSessionResource,
  useDeactivateSessionResource,
} from '@/hooks/use-session-feedback';
import type { FacultyCompletionRow } from '@/types/session-feedback';

const BRAND_GREEN = '#0b6d41';
const MAX_SESSIONS = 20;

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : format(d, 'EEE d MMM');
}

/** The materials manager for ONE session: the materials already posted (with their
 *  aggregate open counts) + a form to post a new link. Fetches lazily — only when
 *  the dialog is open. */
function SessionMaterialsDialog({ row }: { row: FacultyCompletionRow }) {
  const [open, setOpen] = useState(false);
  const label = row.course_name || row.course_code || 'Session';

  const { data: resources, isLoading } = useSessionResources(
    row.timetable_id,
    row.attendance_date,
    row.period_id,
    open,
  );
  const post = usePostSessionResource();
  const deactivate = useDeactivateSessionResource();

  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const list = resources ?? [];

  async function handlePost() {
    setFormError(null);
    const t = title.trim();
    const u = url.trim();
    if (!t) {
      setFormError('Give the material a title.');
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setFormError('Enter a link starting with http:// or https://');
      return;
    }
    try {
      await post.mutateAsync({
        timetableId: row.timetable_id,
        attendanceDate: row.attendance_date,
        periodId: row.period_id,
        kind: 'notebooklm',
        title: t,
        url: u,
      });
      setTitle('');
      setUrl('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not post the material.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="shrink-0">
          <BookOpen className="mr-1.5 h-3.5 w-3.5" />
          Materials
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pre-session materials</DialogTitle>
          <DialogDescription>
            {label} · {fmtDate(row.attendance_date)}. Post a NotebookLM link (or any material)
            for this session. Learners see it on their feedback list; you see how many opened
            it — a count only, never who.
          </DialogDescription>
        </DialogHeader>

        {/* Materials already posted for this session */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <BeatLoader color={BRAND_GREEN} size={8} />
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No materials posted yet.</p>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2.5"
              >
                <div className="min-w-0">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
                    style={{ color: BRAND_GREEN }}
                  >
                    <span className="truncate">{r.title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {r.open_count} {r.open_count === 1 ? 'learner opened' : 'learners opened'}
                  </div>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-red-600"
                  disabled={deactivate.isPending}
                  onClick={() => deactivate.mutate(r.id)}
                  title="Remove this material"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Add a new material */}
        <div className="space-y-2 border-t pt-3">
          <div className="space-y-1">
            <Label htmlFor="scf-mat-title">Title</Label>
            <Input
              id="scf-mat-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. NotebookLM — today's topic"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="scf-mat-url">Link</Label>
            <Input
              id="scf-mat-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://notebooklm.google.com/notebook/..."
              inputMode="url"
            />
          </div>
          {formError && (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-xs">{formError}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            className="w-full bg-[#0b6d41] hover:bg-[#0b6d41]/90"
            disabled={post.isPending}
            onClick={handlePost}
          >
            {post.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Post link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Card listing the caller Senior Learner's recent sessions; each opens the
 *  per-session materials manager above. */
export function PreSessionMaterialsControl({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useFacultyCompletion(from, to);

  // Recent sessions, newest first, capped. (Truly-future slots with no attendance
  // yet are slice 3b.)
  const sessions = (data ?? [])
    .slice()
    .sort((a, b) => b.attendance_date.localeCompare(a.attendance_date))
    .slice(0, MAX_SESSIONS);

  return (
    <Card className="mb-6 border-[#0b6d41]/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" style={{ color: BRAND_GREEN }} />
          <CardTitle>Pre-session materials</CardTitle>
        </div>
        <CardDescription>
          Share a NotebookLM link (or any material) for a session. Learners see it on their
          feedback list; you see how many opened it — an honest read on whether it was used,
          shown as a count only, never who.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <BeatLoader color={BRAND_GREEN} size={9} />
          </div>
        ) : sessions.length === 0 ? (
          <Alert>
            <AlertDescription>
              No recent sessions yet. A session appears here once its attendance is marked —
              then you can post materials for it.
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="divide-y rounded-md border">
            {sessions.map((row) => {
              const key = `${row.timetable_id}-${row.period_id}-${row.attendance_date}`;
              const label = row.course_name || row.course_code || 'Session';
              return (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {fmtDate(row.attendance_date)}
                    </div>
                  </div>
                  <SessionMaterialsDialog row={row} />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
