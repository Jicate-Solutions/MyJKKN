'use client';

import { useState, useMemo, useCallback } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { useImsCart } from '@/hooks/ims/use-ims-cart';
import {
  useImsSellableItems,
  useCreateImsSale,
} from '@/hooks/ims/use-ims-sales';
import { ImsSalesService } from '@/lib/services/ims/sales-service';
import { ImsStoreService } from '@/lib/services/ims/store-service';
import { buildReceiptData, formatCurrencyINR } from '@/lib/utils/ims-receipt';
import { generateAndUploadReceiptPdf } from '@/lib/utils/ims-receipt-pdf';
import { PaymentModal } from '@/components/ims/payment-modal';
import { ReceiptModal } from '@/components/ims/receipt-modal';
import type {
  ImsSellableItem,
  ImsSale,
  ImsPaymentMethod,
} from '@/types/ims';
import type { ImsReceiptData } from '@/types/ims/receipt';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  X,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { toast } from 'sonner';

export default function PointOfSalePage() {
  const { profile } = useAuth();
  const { storeId, institutionId } = useImsStoreContext();

  // Zustand-backed cart
  const {
    items: cartItems,
    customerType,
    customerName,
    customerPhone,
    subtotal,
    total,
    itemCount,
    isEmpty,
    addItem,
    removeItem,
    updateQuantity,
    setCustomer,
    clearCart,
  } = useImsCart();

  // Item search
  const [searchQuery, setSearchQuery] = useState('');

  // Checkout modal
  const [showPayment, setShowPayment] = useState(false);

  // Receipt modal
  const [receiptData, setReceiptData] = useState<ImsReceiptData | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);

  // Data hooks — now using storeId
  const { data: sellableItems, isLoading: itemsLoading } =
    useImsSellableItems(storeId || '', institutionId);
  const createSale = useCreateImsSale();

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!sellableItems) return [];
    if (!searchQuery.trim()) return sellableItems;
    const query = searchQuery.toLowerCase();
    return sellableItems.filter(
      (item: ImsSellableItem) =>
        item.name.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        item.category_name.toLowerCase().includes(query)
    );
  }, [sellableItems, searchQuery]);

  // Add item to cart via Zustand
  const handleAddToCart = useCallback(
    (item: ImsSellableItem) => {
      const existing = cartItems.find((ci) => ci.item_id === item.id);
      if (existing && existing.quantity >= item.available_quantity) {
        toast.error(`Only ${item.available_quantity} ${item.unit_abbreviation} available`);
        return;
      }
      addItem({
        item_id: item.id,
        name: item.name,
        code: item.code,
        unit_price: item.selling_price,
        cost_price: item.cost_price,
        max_quantity: item.available_quantity,
      });
    },
    [cartItems, addItem]
  );

  // Stock validation for payment modal
  const handleValidateStock = useCallback(async (): Promise<string[]> => {
    if (!storeId) return ['No store selected'];
    return ImsSalesService.validateStock(
      cartItems.map((i) => ({ item_id: i.item_id, quantity: i.quantity, name: i.name })),
      storeId
    );
  }, [cartItems, storeId]);

  // Create sale for payment modal
  const handleCreateSale = useCallback(
    async (paymentParams: {
      payment_method: ImsPaymentMethod;
      cash_amount?: number;
      gpay_amount?: number;
      card_amount?: number;
      gpay_transaction_id?: string;
      upi_qr_amount?: number;
      upi_qr_transaction_ref?: string;
    }): Promise<ImsSale> => {
      const sale = await createSale.mutateAsync({
        data: {
          institution_id: institutionId || '',
          store_id: storeId || undefined,
          customer_type: customerType,
          customer_name: customerName || undefined,
          payment_method: paymentParams.payment_method,
          cash_amount: paymentParams.cash_amount,
          gpay_amount: paymentParams.gpay_amount,
          card_amount: paymentParams.card_amount,
          gpay_transaction_id: paymentParams.gpay_transaction_id,
          upi_qr_amount: paymentParams.upi_qr_amount,
          upi_qr_transaction_ref: paymentParams.upi_qr_transaction_ref,
          items: cartItems.map((ci) => ({
            item_id: ci.item_id,
            quantity: ci.quantity,
            unit_price: ci.unit_price,
            cost_price: ci.cost_price,
          })),
        },
        userId: profile?.id || '',
      });
      return sale;
    },
    [createSale, institutionId, storeId, customerType, customerName, cartItems, profile]
  );

  // After sale completes
  const handleSaleComplete = useCallback(
    async (sale: ImsSale) => {
      setShowPayment(false);

      // Build receipt data
      try {
        const fullSale = await ImsSalesService.getSale(sale.id);
        const store = storeId
          ? await ImsStoreService.getStore(storeId)
          : null;

        if (store) {
          const receipt = buildReceiptData(fullSale, store);
          setReceiptData(receipt);
          setShowReceipt(true);

          // Fire-and-forget: auto-upload receipt PDF to storage
          generateAndUploadReceiptPdf(receipt, sale.id, storeId!).catch(() => {});
        }
      } catch {
        toast.warning('Sale completed but receipt could not be loaded. Check Sales History.');
      }

      // Clear the Zustand cart
      clearCart();
    },
    [storeId, clearCart]
  );

  return (
    <ContentLayout title="Point of Sale">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Point of Sale</h2>
            <p className="text-muted-foreground">
              Search items, add to cart, and complete sales
            </p>
          </div>
          <Badge variant="outline" className="text-sm self-start">
            <ShoppingCart className="mr-1 h-3 w-3" />
            {itemCount} items in cart
          </Badge>
        </div>

        {/* Main POS Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Item Browser (2/3) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Search */}
            <Card>
              <CardContent className="pt-6 pb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items by name, code, or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </CardContent>
            </Card>

            {/* Items Grid */}
            <Card>
              <CardContent className="pt-6">
                {itemsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <BeatLoader color="hsl(var(--primary))" size={10} />
                  </div>
                ) : !filteredItems || filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
                    <p className="text-lg font-medium">No items found</p>
                    <p className="text-sm">
                      {searchQuery
                        ? 'Try a different search term'
                        : 'No sellable items available'}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {filteredItems.map((item: ImsSellableItem) => {
                      const inCart = cartItems.find((ci) => ci.item_id === item.id);
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleAddToCart(item)}
                          className="relative flex flex-col p-3 border rounded-lg hover:border-primary hover:bg-accent/50 transition-colors text-left"
                        >
                          {inCart && (
                            <Badge className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs">
                              {inCart.quantity}
                            </Badge>
                          )}
                          <span className="font-medium text-sm truncate">
                            {item.name}
                          </span>
                          <span className="text-xs text-muted-foreground truncate">
                            {item.code} | {item.category_name}
                          </span>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-bold text-primary">
                              {formatCurrencyINR(item.selling_price)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {item.available_quantity} {item.unit_abbreviation}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Cart & Checkout (1/3) */}
          <div className="space-y-4">
            {/* Cart Items */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Cart</CardTitle>
                  {!isEmpty && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearCart}
                      className="text-destructive hover:text-destructive"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isEmpty ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Cart is empty</p>
                    <p className="text-xs">Click items to add them</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                    {cartItems.map((item) => (
                      <div
                        key={item.item_id}
                        className="flex flex-col gap-2 p-3 border rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrencyINR(item.unit_price)} each
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={() => removeItem(item.item_id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                updateQuantity(item.item_id, item.quantity - 1)
                              }
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-sm font-medium">
                              {item.quantity}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() =>
                                updateQuantity(item.item_id, item.quantity + 1)
                              }
                              disabled={item.quantity >= item.max_quantity}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="text-sm font-medium whitespace-nowrap">
                            {formatCurrencyINR(item.unit_price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary + Checkout Button */}
                {!isEmpty && (
                  <div className="border-t pt-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatCurrencyINR(subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold border-t pt-2">
                      <span>Total</span>
                      <span className="text-primary">
                        {formatCurrencyINR(total)}
                      </span>
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      onClick={() => setShowPayment(true)}
                    >
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Checkout - {formatCurrencyINR(total)}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        open={showPayment}
        onOpenChange={setShowPayment}
        items={cartItems}
        total={total}
        storeId={storeId || ''}
        institutionId={institutionId || ''}
        customerType={customerType}
        customerName={customerName}
        customerPhone={customerPhone}
        onCustomerChange={(type, name, phone) => setCustomer(type, name, phone)}
        onSaleComplete={handleSaleComplete}
        onValidateStock={handleValidateStock}
        onCreateSale={handleCreateSale}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        open={showReceipt}
        onOpenChange={setShowReceipt}
        receiptData={receiptData}
      />
    </ContentLayout>
  );
}
