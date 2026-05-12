'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Copy,
  ExternalLink,
  Pencil,
  MoreHorizontal,
  PowerOff,
  CheckCircle2,
  Link2,
} from 'lucide-react';
import type { CampaignLink } from '@/types/admission/campaign';
import toast from 'react-hot-toast';

interface Props {
  links: CampaignLink[] | undefined;
  loading?: boolean;
  onEdit?: (linkId: string) => void;
  onDeactivate?: (linkId: string) => void;
}

export function CampaignLinksTable({
  links,
  loading,
  onEdit,
  onDeactivate,
}: Props) {
  const [pendingDeactivate, setPendingDeactivate] =
    useState<CampaignLink | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  if (loading) {
    return <div className="h-32 animate-pulse rounded-lg bg-muted" />;
  }

  if (!links || links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
        <Link2 className="size-8 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No share links yet</p>
        <p className="text-xs text-muted-foreground">
          Click &quot;+ New Link&quot; to create your first one.
        </p>
      </div>
    );
  }

  async function copyUrl(token: string) {
    const url = `${window.location.origin}/c/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      toast.success('Link copied');
      setTimeout(() => setCopiedToken(null), 1500);
    } catch {
      toast.error(`Could not copy — copy manually: ${url}`);
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Link</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden text-right tabular-nums md:table-cell">
                Clicks
              </TableHead>
              <TableHead className="hidden text-right tabular-nums md:table-cell">
                Captures
              </TableHead>
              <TableHead className="hidden text-right tabular-nums lg:table-cell">
                CTR
              </TableHead>
              <TableHead className="w-[120px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((l) => {
              const ctr =
                l.click_count > 0
                  ? ((l.capture_count / l.click_count) * 100).toFixed(1)
                  : null;
              return (
                <TableRow key={l.id} className="group">
                  <TableCell className="max-w-[280px]">
                    <div className="font-medium leading-tight">
                      {l.name}
                    </div>
                    <code className="text-xs text-muted-foreground">
                      /c/{l.token}
                    </code>
                    {/* Mobile-only inline metrics — visible until md */}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground md:hidden">
                      <span>
                        <strong className="text-foreground tabular-nums">
                          {l.click_count.toLocaleString()}
                        </strong>{' '}
                        clicks
                      </span>
                      <span>
                        <strong className="text-foreground tabular-nums">
                          {l.capture_count.toLocaleString()}
                        </strong>{' '}
                        captures
                      </span>
                      {ctr && (
                        <span>
                          <strong className="text-foreground tabular-nums">
                            {ctr}%
                          </strong>{' '}
                          CTR
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={l.is_active ? 'default' : 'secondary'}>
                      {l.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {l.click_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {l.capture_count.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">
                    {ctr ? `${ctr}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      {/* Quick-copy stays inline — most frequent action */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => copyUrl(l.token)}
                        title="Copy share URL"
                      >
                        {copiedToken === l.token ? (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        <span className="sr-only">Copy share URL</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">More actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel>Link actions</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => copyUrl(l.token)}
                          >
                            <Copy className="mr-2 size-4" />
                            Copy share URL
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              window.open(`/c/${l.token}`, '_blank')
                            }
                          >
                            <ExternalLink className="mr-2 size-4" />
                            Open in new tab
                          </DropdownMenuItem>
                          {onEdit && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onEdit(l.id)}>
                                <Pencil className="mr-2 size-4" />
                                Edit link
                              </DropdownMenuItem>
                            </>
                          )}
                          {onDeactivate && l.is_active && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setPendingDeactivate(l)}
                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                              >
                                <PowerOff className="mr-2 size-4" />
                                Deactivate link
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!pendingDeactivate}
        onOpenChange={(open) => !open && setPendingDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this share link?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  <strong>{pendingDeactivate?.name}</strong> (
                  <code>/c/{pendingDeactivate?.token}</code>) will stop
                  redirecting and new clicks won&apos;t be logged.
                </p>
                <p className="mt-2 text-xs">
                  Existing click history and lead attribution are
                  preserved. You can&apos;t undo this — deactivation is
                  one-way (create a new link if needed).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeactivate && onDeactivate) {
                  onDeactivate(pendingDeactivate.id);
                }
                setPendingDeactivate(null);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
