// Congress Trades panel — Alpha Vantage CONGRESS_TRADES per symbol, served
// through the shared cache-first avClient so stale data is always available
// when the quota is exhausted or upstream fails. One symbol failing never
// fails the others.
//
// GET /api/congress-trades?symbols=AMD,ALAB   (optional; default portfolio set)
//
// Response:
//   { symbols: [{ symbol, trades, fetchedAt, stale, error }],
//     trades:  [merged, transactionDate desc],
//     updatedAt, source: 'alphavantage' }
// Per-symbol upstream failure never becomes a 500 as long as at least one
// symbol resolves or stale data exists; all-fail-with-no-data -> 503.

import { NextResponse } from 'next/server';
import { avFetch } from '../../lib/av-client';

const DEFAULT_SYMBOLS = ['AMD', 'AAOI', 'ALAB', 'RKLB'];
const SYMBOL_PATTERN = /^[A-Z.]{1,10}$/;
const CONGRESS_TTL_SECONDS = 86_400;

// Map the verified AV CONGRESS_TRADES schema onto the panel contract. Unknown
// or missing values stay null — the UI renders 'N/A', never invents data.
function normalizeTrade(trade, symbol) {
  const numberOrNull = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    symbol,
    politician: trade?.politician || null,
    party: trade?.party || null,
    state: trade?.state || null,
    chamber: trade?.chamber || null,
    transactionType: trade?.transaction_type || null,
    transactionDate: trade?.transaction_date || null,
    notificationDate: trade?.notification_date || null,
    amountMin: numberOrNull(trade?.amount_min),
    amountMax: numberOrNull(trade?.amount_max),
    assetName: trade?.asset_name || null,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const symbols = [...new Set(
    (searchParams.get('symbols') || '')
      .split(',')
      .map((symbol) => symbol.trim().toUpperCase())
      .filter((symbol) => SYMBOL_PATTERN.test(symbol)),
  )];

  if (!symbols.length) {
    return NextResponse.json(
      { error: 'symbols query parameter is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const perSymbol = await Promise.all(symbols.map(async (symbol) => {
    try {
      const { data, fetchedAt, stale, error } = await avFetch(
        'CONGRESS_TRADES',
        { symbol },
        { ttlSeconds: CONGRESS_TTL_SECONDS },
      );
      const trades = Array.isArray(data?.trades)
        ? data.trades.map((trade) => normalizeTrade(trade, symbol))
        : [];
      return { symbol, trades, fetchedAt, stale, error };
    } catch (error) {
      // A single symbol blowing up must not take the panel down.
      return { symbol, trades: [], fetchedAt: null, stale: false, error: error?.message || 'fetch_failed' };
    }
  }));

  const merged = perSymbol
    .flatMap((entry) => entry.trades)
    .sort((a, b) => String(b.transactionDate || '').localeCompare(String(a.transactionDate || '')));

  const anyResolved = perSymbol.some((entry) => entry.trades.length > 0 || entry.stale);
  if (!anyResolved) {
    return NextResponse.json(
      {
        error: perSymbol[0]?.error || 'upstream_unavailable',
        symbols: perSymbol,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const fetchedAts = perSymbol.map((entry) => entry.fetchedAt).filter(Boolean);
  return NextResponse.json(
    {
      symbols: perSymbol,
      trades: merged,
      updatedAt: fetchedAts.length
        ? fetchedAts.reduce((newest, at) => (at > newest ? at : newest), fetchedAts[0])
        : new Date().toISOString(),
      source: 'alphavantage',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
