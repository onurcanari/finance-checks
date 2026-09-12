import { NextResponse } from 'next/server';
import { DATA_DATE, EDGES, ENTITIES, graphSymbols } from '../../lib/supply-chain';

// Live price overlay for the supply-chain map. The graph itself (who supplies
// whom, at what share) is curated in app/lib/supply-chain.js — no market API
// publishes supply allocations. What IS live is every listed entity's quote,
// so the map shows the chain and today's tape side by side.
//
// The symbol list is derived from the graph on the server, so a client cannot
// use this route to quote arbitrary symbols.

// Same Yahoo chart pattern as app/api/quotes/route.js (range=5d&interval=1d),
// 10s AbortController timeout, 300s Next revalidation.
async function quote(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5d&interval=1d`, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
    const result = (await response.json()).chart.result[0];
    const meta = result.meta;
    const closes = (Array.isArray(result.indicators.quote[0].close) ? result.indicators.quote[0].close : []).filter(Number.isFinite);
    const last = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : closes.at(-1) ?? null;
    const previous = closes.length >= 2 ? closes.at(-2) : null;
    const fiveBase = closes.length ? closes.at(0) : null;
    const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b - 1) * 100 : null);
    return {
      symbol,
      price: Number.isFinite(last) ? last : null,
      currency: meta.currency || null,
      oneDay: previous != null ? pct(last, previous) : (meta.regularMarketChangePercent ?? null),
      fiveDay: fiveBase != null ? pct(last, fiveBase) : null,
      unavailable: !Number.isFinite(last),
    };
  } catch {
    // One dead symbol (delisted, taken private, exchange not covered) must not
    // blank the whole map — mark it unavailable and keep the rest.
    return { symbol, price: null, currency: null, oneDay: null, fiveDay: null, unavailable: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const symbols = graphSymbols();
  const results = await Promise.all(symbols.map(quote));
  const quotes = Object.fromEntries(results.map((result) => [result.symbol, result]));
  const unavailable = results.filter((result) => result.unavailable).map((result) => result.symbol);

  return NextResponse.json(
    {
      quotes,
      unavailable,
      // The curated layer's own vintage, so the page can date the graph
      // separately from the live tape.
      dataDate: DATA_DATE,
      entityCount: Object.keys(ENTITIES).length,
      edgeCount: EDGES.length,
      source: 'yahoo',
      fetchedAt: new Date().toISOString(),
      // Every quote failing means the upstream is down, not that the market is
      // quiet — the page shows this as an explicit degraded state.
      live: unavailable.length < symbols.length,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
