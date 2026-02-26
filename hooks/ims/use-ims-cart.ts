'use client';

import { useMemo } from 'react';
import { useStore } from '@/hooks/use-store';
import { useImsCartStore } from '@/lib/stores/ims-cart-store';
import { useImsStoreContext } from './use-ims-store-context';
import type { ImsCustomerType } from '@/types/ims';
import type { ImsCartItem } from '@/lib/stores/ims-cart-store';

/**
 * Cart hook with computed totals and auto store-scoping.
 * Wraps the Zustand cart store and provides derived values.
 */
export function useImsCart() {
  const { storeId } = useImsStoreContext();

  // SSR-safe hydration reads
  const cartStoreId = useStore(useImsCartStore, (s) => s.storeId);
  const items = useStore(useImsCartStore, (s) => s.items) ?? [];
  const customerType = useStore(useImsCartStore, (s) => s.customerType) ?? 'walk_in';
  const customerName = useStore(useImsCartStore, (s) => s.customerName) ?? '';
  const customerPhone = useStore(useImsCartStore, (s) => s.customerPhone) ?? '';
  const notes = useStore(useImsCartStore, (s) => s.notes) ?? '';

  // Direct action accessors (safe for client-only calls)
  const addItem = useImsCartStore((s) => s.addItem);
  const removeItem = useImsCartStore((s) => s.removeItem);
  const updateQuantity = useImsCartStore((s) => s.updateQuantity);
  const setCustomer = useImsCartStore((s) => s.setCustomer);
  const setNotes = useImsCartStore((s) => s.setNotes);
  const clearCart = useImsCartStore((s) => s.clearCart);
  const setStoreScope = useImsCartStore((s) => s.setStoreScope);

  // Computed totals (no discounts per user decision #12)
  const { subtotal, total, itemCount } = useMemo(() => {
    const sub = Math.round(
      items.reduce(
        (sum: number, item: ImsCartItem) => sum + item.unit_price * item.quantity,
        0
      ) * 100
    ) / 100;
    return {
      subtotal: sub,
      total: sub, // No discounts at POS
      itemCount: items.reduce((sum: number, item: ImsCartItem) => sum + item.quantity, 0),
    };
  }, [items]);

  // Check if cart belongs to current store
  const isCartScopedToCurrentStore = cartStoreId === storeId;

  return {
    // State
    storeId: cartStoreId,
    items,
    customerType: customerType as ImsCustomerType,
    customerName,
    customerPhone,
    notes,

    // Computed
    subtotal,
    total,
    itemCount,
    isEmpty: items.length === 0,
    isCartScopedToCurrentStore,

    // Actions
    addItem,
    removeItem,
    updateQuantity,
    setCustomer,
    setNotes,
    clearCart,
    setStoreScope,
  };
}
