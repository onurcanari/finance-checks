// Top Movers (AV TOP_GAINERS_LOSERS) data mapping. AV returns numeric fields
// as strings and change_percentage with a trailing "%" (e.g. "135.9477%");
// volume strings like "24833800". Unknown or malformed values become null —
// the UI renders 'N/A' / dashes, never invents data. Kept free of React and
// Next imports so app/lib/movers.test.js can exercise it fully offline.

// Strip a trailing percent sign if present, then parse. Only strings and
// numbers parse; anything else (null, objects, arrays — Number([7]) is 7!)
// and NaN/±Infinity become null. The empty string is null, not 0.
export function parseNum(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/%$/, '');
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return null;
}

// Map one AV movers entry onto the panel contract. Unrecognized entries stay
// rows with null numbers rather than being dropped, so the panel shows the
// gap instead of silently shrinking the table.
export function normalizeMover(entry) {
  const ticker = typeof entry?.ticker === 'string' ? entry.ticker : '';
  const price = parseNum(entry?.price);
  return {
    ticker,
    price,
    changeAmount: parseNum(entry?.change_amount),
    changePercentage: parseNum(entry?.change_percentage),
    volume: parseNum(entry?.volume),
    unavailable: !ticker || price === null,
  };
}

export function normalizeMoversPayload(payload) {
  return {
    gainers: Array.isArray(payload?.top_gainers) ? payload.top_gainers.map(normalizeMover) : [],
    losers: Array.isArray(payload?.top_losers) ? payload.top_losers.map(normalizeMover) : [],
    active: Array.isArray(payload?.most_actively_traded) ? payload.most_actively_traded.map(normalizeMover) : [],
  };
}

export const MOVERS_TABS = [
  { key: 'gainers', label: 'GAINERS' },
  { key: 'losers', label: 'LOSERS' },
  { key: 'active', label: 'MOST ACTIVE' },
];
