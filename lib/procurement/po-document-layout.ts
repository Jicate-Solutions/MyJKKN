// lib/procurement/po-document-layout.ts
//
// Column sizing shared by the PO PDF and DOCX renderers. The whole document is
// one grid (the item columns); the header, vendor and footer rows span groups
// of those columns, so every border lines up as on the paper PO.

/** Relative widths per item column key; descriptions get the room. */
export function itemColumnWeights(keys: string[]): number[] {
  return keys.map((k) => {
    if (k === 'row_index') return 0.55;
    if (/name|desc|title/i.test(k)) return 3;
    if (/author|spec/i.test(k)) return 1.6;
    return 1;
  });
}

/**
 * Split a grid into consecutive spans whose widths best match `fractions`
 * (which sum to 1). Every span is at least one column; the last absorbs the rest.
 */
export function splitSpans(grid: number[], fractions: number[]): number[] {
  const n = grid.length;
  const total = grid.reduce((a, b) => a + b, 0);
  const spans: number[] = [];
  let col = 0;
  let target = 0;
  for (let i = 0; i < fractions.length; i++) {
    const left = fractions.length - i - 1; // spans still to place after this one
    if (i === fractions.length - 1) {
      spans.push(Math.max(1, n - col));
      break;
    }
    target += fractions[i] * total;
    let end = col + 1;
    let acc = grid.slice(0, end).reduce((a, b) => a + b, 0);
    while (end < n - left && Math.abs(acc + grid[end] - target) < Math.abs(acc - target)) {
      acc += grid[end];
      end++;
    }
    spans.push(end - col);
    col = end;
  }
  return spans;
}
