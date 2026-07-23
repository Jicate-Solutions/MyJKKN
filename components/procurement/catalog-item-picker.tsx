'use client';

import { useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useProcurementItemSearch } from '@/hooks/procurement/use-item-search';
import type {
  ProcurementDomain,
  DomainCtx,
  CatalogItem,
} from '@/lib/services/procurement/domain-adapters/types';
import { ChevronsUpDown } from 'lucide-react';

interface Props {
  domain: ProcurementDomain;
  ctx: DomainCtx;
  /** Currently-selected item label (for the closed trigger). */
  value?: string | null;
  onSelect: (item: CatalogItem) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Domain-agnostic inventory item picker. Searches the registered domain adapter
 * (IMS today) server-side and returns the picked CatalogItem — the caller maps it
 * onto a PR/PO line (setting domain_item_id, which is what actually links the line
 * to real inventory). shouldFilter={false} because filtering happens in the DB, not
 * in cmdk — otherwise cmdk would re-filter the already-filtered server results.
 */
export function CatalogItemPicker({
  domain,
  ctx,
  value,
  onSelect,
  placeholder = 'Search inventory…',
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebounceValue(query, 250);
  const { data: items = [], isFetching } = useProcurementItemSearch(domain, debounced, ctx, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={value ? 'truncate' : 'truncate text-muted-foreground'}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type an item name or code…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {isFetching ? (
              <div className="p-3 text-sm text-muted-foreground">Searching…</div>
            ) : (
              <CommandEmpty>No inventory items match.</CommandEmpty>
            )}
            <CommandGroup>
              {items.map((it) => (
                <CommandItem
                  key={it.domainItemId}
                  value={it.domainItemId}
                  onSelect={() => {
                    onSelect(it);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium flex items-center gap-2">
                      {it.name}
                      {it.isChemical && (
                        <Badge variant="secondary" className="text-[10px]">
                          Chemical
                        </Badge>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {it.code ? `${it.code}` : 'No code'}
                      {it.reorderLevel != null && ` · reorder @ ${it.reorderLevel}`}
                      {it.costPrice != null && ` · ₹${Number(it.costPrice).toLocaleString()}`}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
