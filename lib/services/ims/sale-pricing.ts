// lib/services/ims/sale-pricing.ts
//
// What a POS cart costs, in TypeScript.
//
// WHY THIS EXISTS AT ALL, given ims_pos_checkout already computes the total in SQL:
// a gateway QR must be opened BEFORE the sale exists. The customer scans and pays
// first; only then is stock deducted and an invoice number burnt. So the amount to
// collect has to be known before the checkout function ever runs.
//
// THIS IS A MIRROR OF THE SQL, NOT A SECOND OPINION. It reproduces the arithmetic in
// 20260730120000_ims_pos_checkout_engine.sql line for line:
//
//     v_disc_amt       := (v_unit_price * v_qty * v_disc_pct) / 100;
//     v_subtotal       := v_subtotal + (v_unit_price * v_qty);
//     v_total_discount := v_total_discount + v_disc_amt;
//     v_total_profit   := v_total_profit + ((v_unit_price - v_cost_price) * v_qty - v_disc_amt);
//     ...
//     v_total_amount   := ROUND(v_subtotal - v_total_discount, 2);
//
// If the two ever disagree, the customer is charged one amount and the sale books
// another — so any change here must be made in that migration too, and vice versa.
// Full precision per line; round ONCE, at the payable total. Rounding per line and
// summing gives a different figure.
//
// Prices are NOT resolved here. The caller must read selling_price and cost_price
// from ims_items server-side — the browser may say WHICH item to buy, never what it
// costs.

/** A cart line whose prices have already been read from the catalog. */
export interface PriceableSaleLine {
  item_id: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount_percent?: number;
}

/** One priced line, shaped like an ims_sale_items row. */
export interface PricedSaleLine {
  item_id: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
  profit: number;
}

export interface PricedCart {
  lines: PricedSaleLine[];
  /** Gross of discounts — ims_sales.subtotal. */
  subtotal: number;
  /** Line discounts plus the whole-cart discount — ims_sales.discount_amount. */
  total_discount: number;
  /** The payable amount — ims_sales.total_amount. */
  total_amount: number;
  /** ims_sales.profit_amount. */
  total_profit: number;
}

export function priceCart(
  lines: PriceableSaleLine[],
  additionalDiscount = 0,
): PricedCart {
  if (!lines || lines.length === 0) {
    throw new Error('Sale must contain at least one item');
  }
  if (additionalDiscount < 0) {
    throw new Error('Additional discount cannot be negative');
  }

  let subtotal = 0;
  let totalDiscount = 0;
  let totalProfit = 0;

  const priced: PricedSaleLine[] = lines.map((item) => {
    const discountPercent = item.discount_percent || 0;

    if (item.quantity <= 0) {
      throw new Error(`Quantity must be greater than 0 (item ${item.item_id})`);
    }
    if (item.unit_price < 0 || item.cost_price < 0) {
      throw new Error(`Prices cannot be negative (item ${item.item_id})`);
    }
    if (discountPercent < 0 || discountPercent > 100) {
      throw new Error(`Line discount must be between 0 and 100 (item ${item.item_id})`);
    }

    const discountAmount = (item.unit_price * item.quantity * discountPercent) / 100;
    const lineTotal = item.unit_price * item.quantity - discountAmount;
    const lineProfit = (item.unit_price - item.cost_price) * item.quantity - discountAmount;

    subtotal += item.unit_price * item.quantity;
    totalDiscount += discountAmount;
    totalProfit += lineProfit;

    return {
      item_id: item.item_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      cost_price: item.cost_price,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      total: lineTotal,
      profit: lineProfit,
    };
  });

  totalDiscount += additionalDiscount;
  totalProfit -= additionalDiscount;

  const totalAmount = Math.round((subtotal - totalDiscount) * 100) / 100;

  if (totalAmount < 0) {
    throw new Error('Discount exceeds the bill value');
  }

  return {
    lines: priced,
    subtotal,
    total_discount: totalDiscount,
    total_amount: totalAmount,
    total_profit: totalProfit,
  };
}
