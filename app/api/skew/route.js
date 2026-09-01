// Skew panel — Tradier delta-anchored skew per portfolio ticker, with a daily
// JSON snapshot store so the page can show the weekly change and fall back to
// the last known point when a ticker errors. One ticker failing never fails
// the others.
//
// GET /api/skew            → live per-ticker skew (upserts today's snapshot)
// GET /api/skew?history=1  → stored latest snapshot per ticker (no upstream)
//
// Live response per ticker:
//   { ticker, skew, atmIV, weeklyChange, monthReturn, quadrant,
//     unreliable, asOf, error? }
//
// No Tradier key → 500 { error: 'config_missing' } (mirrors /api/options).

import { NextResponse } from 'next/server';
import { getProvider } from '../../lib/options-providers';
import { computeSkew } from '../../lib/skew';
import { upsertToday, weeklyChange, latestSnapshot } from '../../lib/skew-store';

const TICKERS = ['AMD', 'AAOI', 'ALAB', 'RKLB'];

// Quadrant: skew > 0 = puts bid over calls (protection); sign of the 1-month
// return separates fear from hedged demand.
const QUADRANT = {
  FEAR: 'FEAR',
  HEDGED_RALLY: 'HEDGED RALLY',
  CONTRARIAN: 'CONTRARIAN',
  CHASE: 'CHASE',
};

function quadrantFor(skew, monthReturn) {
  if (skew > 0) return monthReturn < 0 ? QUADRANT.FEAR : QUADRANT.HEDGED_RALLY;
  return monthReturn < 0 ? QUADRANT.CONTRARIAN : QUADRANT.CHASE;
}

// Nearest expiration ≥ today. The provider returns monthlies-then-weeklies,
// so sort by date here. All calls/puts in one chain share the expiration.
function nearestExpiration(expirations) {
  const today = new Date().toISOString().slice(0, 10);
  return [...expirations]
    .filter((date) => date >= today)
    .sort((a, b) => a.localeCompare(b))[0] || null;
}

// 1-month price return (%) from the existing Yahoo chart pattern (see
// app/api/quotes/route.js); 10s timeout, one failure → null, never a throw.
async function oneMonthReturn(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
      { signal: controller.signal, next: { revalidate: 300 } },
    );
    if (!response.ok) return null;
    const result = (await response.json())?.chart?.result?.[0];
    const meta = result?.meta;
    const closes = (Array.isArray(result?.indicators?.quote?.[0]?.close)
      ? result.indicators.quote[0].close
      : []).filter(Number.isFinite);
    const last = Number.isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : closes.at(-1) || null;
    const base = closes.length ? closes[0] : null;
    if (!Number.isFinite(last) || !Number.isFinite(base) || base === 0) return null;
    return (last / base - 1) * 100;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function skewForTicker(provider, ticker) {
  // Own try/catch per ticker: one failure must never fail the others.
  try {
    const expirations = await provider.getExpirations(ticker);
    const expiration = nearestExpiration(expirations);
    if (!expiration) {
      return { ticker, error: 'no_expiration' };
    }

    const [chain, quote] = await Promise.all([
      provider.getChain(ticker, expiration),
      provider.getUnderlyingQuote(ticker),
    ]);
    const spot = Number(quote?.price);
    if (!Number.isFinite(spot) || spot <= 0) {
      return { ticker, error: 'no_spot' };
    }

    const skew = computeSkew(chain, spot);
    if (skew.error) {
      return { ticker, error: skew.error };
    }

    const change = weeklyChange(ticker);
    const monthReturn = await oneMonthReturn(ticker);
    const asOf = new Date().toISOString();

    upsertToday(ticker, {
      skew: skew.skew,
      atmIV: skew.atmIv,
      putIV: skew.putIv,
      callIV: skew.callIv,
    });

    return {
      ticker,
      skew: skew.skew,
      atmIV: skew.atmIv,
      weeklyChange: change,
      monthReturn,
      quadrant: quadrantFor(skew.skew, monthReturn),
      unreliable: skew.unreliable,
      asOf,
      expiration,
    };
  } catch (error) {
    return { ticker, error: error?.message || 'fetch_failed' };
  }
}

export async function GET(request) {
  const historyMode = request.nextUrl.searchParams.get('history');

  if (historyMode) {
    const snapshots = TICKERS.map((ticker) => {
      const snapshot = latestSnapshot(ticker);
      return snapshot ? { ticker, ...snapshot } : { ticker, error: 'no_history' };
    });
    return NextResponse.json(
      { tickers: snapshots, updatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!process.env.TRADIER_API_KEY?.trim()) {
    return NextResponse.json(
      { error: 'config_missing', detail: 'TRADIER_API_KEY missing' },
      { status: 500 },
    );
  }

  let provider;
  try {
    provider = getProvider('tradier');
  } catch (error) {
    return NextResponse.json(
      { error: 'config_missing', detail: error?.message || 'provider init failed' },
      { status: 500 },
    );
  }

  const tickers = await Promise.all(TICKERS.map((ticker) => skewForTicker(provider, ticker)));
  const anyResolved = tickers.some((entry) => !entry.error);

  return NextResponse.json(
    { tickers, updatedAt: new Date().toISOString(), source: 'tradier' },
    {
      status: anyResolved ? 200 : 502,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
