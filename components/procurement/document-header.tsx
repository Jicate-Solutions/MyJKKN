'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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

export interface DocAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Red styling; sorted last and collapsed into ⋯ first. */
  destructive?: boolean;
  /** Ask before running (use for irreversible actions such as Cancel). */
  confirm?: { title: string; description?: string; confirmLabel?: string };
}

export interface DocPrimaryAction extends DocAction {
  /** Variants of the primary step, shown behind the ▾ half of a split button. */
  menu?: (DocAction & { hint?: string })[];
}

interface DocumentHeaderProps {
  title: ReactNode;
  /** Status badge rendered next to the title. */
  status?: ReactNode;
  /** One line under the title: who acts next / what the primary does. */
  next?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  primary?: DocPrimaryAction | null;
  /** Declining action — red outline, never collapsed. */
  reject?: DocAction | null;
  /** Other actions in priority order; the lowest-priority ones move into ⋯ when the row runs out of room. */
  actions?: DocAction[];
  className?: string;
  /** Smaller title, info line and buttons — for short pages like a request. */
  compact?: boolean;
}

// Widths the row must leave for the back button and a readable title (px).
const BACK_W = 40;
const MIN_TITLE_W = 176;
const GAP = 8;
const STACK_QUERY = '(max-width: 639px)';

/**
 * Sticky header for procurement document pages (request, RFQ, PO, GRN): title, status,
 * next step and every action in one row. Actions stay visible as compact buttons and
 * only fall back to the ⋯ menu when they don't fit (priority+ pattern).
 */
export function DocumentHeader({
  title,
  status,
  next,
  onBack,
  backLabel = 'Back',
  primary,
  reject,
  actions = [],
  className,
  compact = false,
}: DocumentHeaderProps) {
  const ordered = [...actions.filter((a) => !a.destructive), ...actions.filter((a) => a.destructive)];
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(ordered.length);
  const [pending, setPending] = useState<DocAction | null>(null);
  const [stuck, setStuck] = useState(false);

  const orderKey = ordered.map((a) => `${a.key}:${a.label}`).join('|');
  const fixedKey = `${primary?.label ?? ''}|${primary?.menu?.length ?? 0}|${reject?.label ?? ''}`;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;
    const calc = () => {
      const width = (sel: string) =>
        Array.from(measure.querySelectorAll<HTMLElement>(sel)).map((n) => n.getBoundingClientRect().width);
      const sec = width('[data-m="sec"]');
      const fixed = width('[data-m="fixed"]').reduce((s, w) => s + w + GAP, 0);
      const moreW = width('[data-m="more"]')[0] ?? 40;
      const stacked = window.matchMedia(STACK_QUERY).matches;
      const avail = stacked ? root.clientWidth : root.clientWidth - BACK_W - MIN_TITLE_W - GAP * 2;
      let used = fixed;
      let n = 0;
      for (let i = 0; i < sec.length; i++) {
        const isLast = i === sec.length - 1;
        const need = used + sec[i] + GAP + (isLast ? 0 : moreW + GAP);
        if (need > avail) break;
        used += sec[i] + GAP;
        n++;
      }
      setVisibleCount(n);
    };
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(root);
    return () => ro.disconnect();
  }, [orderKey, fixedKey]);

  // Compact the header once the page scrolls under the app navbar.
  useLayoutEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const run = (a: DocAction) => {
    if (a.confirm) setPending(a);
    else a.onClick();
  };

  const shown = ordered.slice(0, visibleCount);
  const hidden = ordered.slice(visibleCount);
  // Compact: smaller text, tighter padding and icons; phones keep a 36 px tap target.
  const btnSize = compact ? 'h-9 gap-1.5 px-2.5 text-xs sm:h-7 [&_svg]:h-3.5 [&_svg]:w-3.5' : 'h-10 sm:h-9';

  const actionButton = (a: DocAction, extra?: string) => {
    const Icon = a.icon;
    return (
      <Button
        key={a.key}
        type="button"
        variant="outline"
        disabled={a.disabled}
        onClick={() => run(a)}
        className={cn(btnSize, 'px-3', a.destructive && 'text-destructive hover:text-destructive', extra)}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {a.label}
      </Button>
    );
  };

  const rejectButton = reject && (
    <Button
      type="button"
      variant="outline"
      disabled={reject.disabled}
      onClick={() => run(reject)}
      className={cn(
        btnSize,
        'flex-1 px-3 sm:flex-none border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
      )}
    >
      {reject.icon && <reject.icon className="h-4 w-4" />}
      {reject.label}
    </Button>
  );

  const primaryButton = primary && (
    <div className="flex flex-1 sm:flex-none">
      <Button
        type="button"
        disabled={primary.disabled}
        onClick={() => run(primary)}
        className={cn(btnSize, 'flex-1', compact ? 'px-3' : 'px-4', primary.menu?.length && 'rounded-r-none')}
      >
        {primary.icon && <primary.icon className="h-4 w-4" />}
        {primary.label}
      </Button>
      {!!primary.menu?.length && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              aria-label={`More ${primary.label} options`}
              className={cn(btnSize, 'w-10 rounded-l-none border-l border-primary-foreground/30 px-0 sm:w-8')}
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[14rem]">
            {primary.menu.map((m) => (
              <DropdownMenuItem key={m.key} disabled={m.disabled} onSelect={() => run(m)} className="items-start gap-2">
                {m.icon && <m.icon className="mt-0.5 h-4 w-4" />}
                <span>
                  {m.label}
                  {m.hint && <span className="block text-xs text-muted-foreground">{m.hint}</span>}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  const hiddenSafe = hidden.filter((a) => !a.destructive);
  const hiddenDanger = hidden.filter((a) => a.destructive);
  const moreMenu = hidden.length > 0 && (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" aria-label="More actions" className={cn(btnSize, 'w-10 shrink-0 px-0 sm:w-9')}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {hiddenSafe.map((a) => (
          <DropdownMenuItem key={a.key} disabled={a.disabled} onSelect={() => run(a)} className="gap-2">
            {a.icon && <a.icon className="h-4 w-4" />}
            {a.label}
          </DropdownMenuItem>
        ))}
        {hiddenSafe.length > 0 && hiddenDanger.length > 0 && <DropdownMenuSeparator />}
        {hiddenDanger.map((a) => (
          <DropdownMenuItem
            key={a.key}
            disabled={a.disabled}
            onSelect={() => run(a)}
            className="gap-2 text-destructive focus:text-destructive"
          >
            {a.icon && <a.icon className="h-4 w-4" />}
            {a.label}
            {a.confirm ? '…' : ''}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const hasActions = !!primary || !!reject || ordered.length > 0;

  return (
    <>
      <div
        ref={rootRef}
        className={cn(
          'sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-transparent bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-[padding,border-color] sm:-mx-8 sm:flex-nowrap sm:px-8',
          stuck && 'border-border sm:py-2',
          className
        )}
      >
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={backLabel}
            onClick={onBack}
            className="h-10 w-10 shrink-0 sm:h-9 sm:w-9"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-auto">
          <div className="flex min-w-0 items-center gap-2">
            <h2
              className={cn(
                'truncate font-bold tracking-tight transition-[font-size]',
                stuck || compact ? 'text-lg' : 'text-xl sm:text-2xl'
              )}
            >
              {title}
            </h2>
            {status && <span className="shrink-0">{status}</span>}
          </div>
          {next && (
            <p className={cn(compact ? 'text-xs' : 'text-sm', 'text-muted-foreground sm:truncate', stuck && 'sm:hidden')}>{next}</p>
          )}
        </div>

        {hasActions && (
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:shrink-0">
            {/* Phone: [Reject][Primary][…][⋯]; desktop: […][⋯][Reject][Primary] */}
            <div className="contents sm:flex sm:items-center sm:gap-2 sm:order-none">
              {shown.map((a) => actionButton(a, 'hidden sm:inline-flex'))}
              <span className="hidden sm:contents">{moreMenu}</span>
            </div>
            {rejectButton}
            {primaryButton}
            <span className="contents sm:hidden">
              {shown.map((a) => actionButton(a))}
              {moreMenu}
            </span>
          </div>
        )}

        {/* Off-screen copies used only to measure button widths. */}
        <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 w-0 overflow-hidden">
        <div ref={measureRef} className="flex w-max gap-2">
          {ordered.map((a) => (
            <span key={a.key} data-m="sec" className="inline-flex">
              {actionButton({ ...a, onClick: () => {} })}
            </span>
          ))}
          {reject && (
            <span data-m="fixed" className="inline-flex">
              <Button type="button" variant="outline" tabIndex={-1} className="h-9 px-3">
                {reject.icon && <reject.icon className="h-4 w-4" />}
                {reject.label}
              </Button>
            </span>
          )}
          {primary && (
            <span data-m="fixed" className="inline-flex">
              <Button type="button" tabIndex={-1} className="h-9 px-4">
                {primary.icon && <primary.icon className="h-4 w-4" />}
                {primary.label}
              </Button>
              {!!primary.menu?.length && <span className="inline-block w-8" />}
            </span>
          )}
          <span data-m="more" className="inline-block w-9" />
        </div>
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.confirm?.title}</AlertDialogTitle>
            {pending?.confirm?.description && (
              <AlertDialogDescription>{pending.confirm.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(pending?.destructive && 'bg-destructive text-destructive-foreground hover:bg-destructive/90')}
              onClick={() => {
                const a = pending;
                setPending(null);
                a?.onClick();
              }}
            >
              {pending?.confirm?.confirmLabel ?? pending?.label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
