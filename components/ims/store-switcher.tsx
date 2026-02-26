'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Store, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { useImsActiveStore } from '@/hooks/ims/use-ims-active-store';
import { useImsStoresForSelect } from '@/hooks/ims/use-ims-stores';
import { useImsCartStore } from '@/lib/stores/ims-cart-store';
import { usePermissions } from '@/hooks/use-permissions';
import { useStore } from '@/hooks/use-store';

export function StoreSwitcher() {
  const [open, setOpen] = useState(false);
  const [confirmStore, setConfirmStore] = useState<{
    id: string;
    institutionId: string;
    name: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { isSuperAdmin, userProfile } = usePermissions();

  const storeId = useStore(useImsActiveStore, (s) => s.storeId);
  const storeName = useStore(useImsActiveStore, (s) => s.storeName);
  const setActiveStore = useImsActiveStore((s) => s.setActiveStore);

  // Cart state for confirmation dialog
  const cartItems = useStore(useImsCartStore, (s) => s.items) ?? [];
  const clearCart = useImsCartStore((s) => s.clearCart);
  const setCartStoreScope = useImsCartStore((s) => s.setStoreScope);

  const userInstitutionId = userProfile?.institution_id ?? null;

  const { data: stores = [], isLoading } = useImsStoresForSelect(
    userInstitutionId,
    isSuperAdmin
  );

  const performSwitch = (selectedId: string, institutionId: string, name: string) => {
    clearCart();
    setCartStoreScope(selectedId);
    setActiveStore(selectedId, institutionId, name);
    setOpen(false);
    setConfirmStore(null);

    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('ims-');
      },
    });
  };

  const handleStoreSelect = (selectedId: string) => {
    if (selectedId === storeId) {
      setOpen(false);
      return;
    }

    const store = stores.find((s) => s.id === selectedId);
    if (!store) return;

    // If cart has items, show confirmation dialog
    if (cartItems.length > 0) {
      setConfirmStore({
        id: store.id,
        institutionId: store.institution_id ?? '',
        name: store.name,
      });
      setOpen(false);
      return;
    }

    performSwitch(store.id, store.institution_id ?? '', store.name);
  };

  // No stores at all — static badge
  if (stores.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">No Store</span>
        <Badge variant="secondary" className="text-xs">Store</Badge>
      </div>
    );
  }

  // Exactly 1 store and already selected — static badge (no dropdown needed)
  if (stores.length === 1 && storeId) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium truncate">
          {storeName || stores[0].name}
        </span>
        <Badge variant="secondary" className="text-xs">Store</Badge>
      </div>
    );
  }

  // Exactly 1 store but NOT yet selected — clickable button to select it
  if (stores.length === 1 && !storeId) {
    const solo = stores[0];
    return (
      <Button
        variant="outline"
        className="w-full justify-start gap-2"
        onClick={() => performSwitch(solo.id, solo.institution_id ?? '', solo.name)}
      >
        <Store className="h-4 w-4 shrink-0" />
        <span className="truncate">{solo.name}</span>
        <Badge variant="secondary" className="text-xs ml-auto">Select</Badge>
      </Button>
    );
  }

  // Any user with multiple stores — full combobox dropdown
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between gap-2"
          >
            <div className="flex items-center gap-2 truncate">
              <Store className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {storeName || 'Select a store...'}
              </span>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search stores..." />
            <CommandList>
              <CommandEmpty>
                {isLoading ? 'Loading stores...' : 'No stores found.'}
              </CommandEmpty>
              <CommandGroup>
                {stores.map((store) => (
                  <CommandItem
                    key={store.id}
                    value={store.name}
                    onSelect={() => handleStoreSelect(store.id)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        storeId === store.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{store.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {store.code}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Cart clear confirmation dialog */}
      <AlertDialog
        open={!!confirmStore}
        onOpenChange={(open) => !open && setConfirmStore(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Switch Store?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Switching to <strong>{confirmStore?.name}</strong> will clear your
              current cart ({cartItems.length} item{cartItems.length !== 1 ? 's' : ''}).
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmStore) {
                  performSwitch(
                    confirmStore.id,
                    confirmStore.institutionId,
                    confirmStore.name
                  );
                }
              }}
            >
              Clear Cart & Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
