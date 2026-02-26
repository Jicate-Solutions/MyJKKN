import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ImsCustomerType } from '@/types/ims';

export interface ImsCartItem {
  item_id: string;
  name: string;
  code: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  max_quantity: number;
}

export interface ImsCartState {
  storeId: string | null;
  items: ImsCartItem[];
  customerType: ImsCustomerType;
  customerName: string;
  customerPhone: string;
  notes: string;

  // Actions
  setStoreScope: (storeId: string) => void;
  addItem: (item: Omit<ImsCartItem, 'quantity'> & { quantity?: number }) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  setCustomer: (type: ImsCustomerType, name: string, phone: string) => void;
  setNotes: (notes: string) => void;
  clearCart: () => void;
}

export const useImsCartStore = create(
  persist<ImsCartState>(
    (set, get) => ({
      storeId: null,
      items: [],
      customerType: 'walk_in',
      customerName: '',
      customerPhone: '',
      notes: '',

      setStoreScope: (storeId) => set({ storeId }),

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.item_id === item.item_id);
          if (existing) {
            const newQty = existing.quantity + (item.quantity || 1);
            if (newQty > item.max_quantity) return state;
            return {
              items: state.items.map((i) =>
                i.item_id === item.item_id ? { ...i, quantity: newQty } : i
              ),
            };
          }
          return {
            items: [
              ...state.items,
              { ...item, quantity: item.quantity || 1 },
            ],
          };
        }),

      removeItem: (itemId) =>
        set((state) => ({
          items: state.items.filter((i) => i.item_id !== itemId),
        })),

      updateQuantity: (itemId, quantity) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.item_id === itemId
              ? { ...i, quantity: Math.min(quantity, i.max_quantity) }
              : i
          ),
        })),

      setCustomer: (type, name, phone) =>
        set({ customerType: type, customerName: name, customerPhone: phone }),

      setNotes: (notes) => set({ notes }),

      clearCart: () =>
        set({
          items: [],
          customerType: 'walk_in',
          customerName: '',
          customerPhone: '',
          notes: '',
        }),
    }),
    {
      name: 'jkkn-ims-cart',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
