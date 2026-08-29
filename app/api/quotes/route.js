import { NextResponse } from 'next/server';
import { PORTFOLIO } from '../../lib/portfolio';

const nameOf = new Map(PORTFOLIO.map(({ symbol, name }) => [symbol, name]));
const SYMBOL_PATTERN = /^[A-Za-z0-9^][A-Za-z0-9.^_=-]{0,31}$/;

// Follow the app/api/market-snapshot/route.js Yahoo chart pattern (range=5d&interval=1d),
// with a 10s AbortController timeout and Next.js revalidation of 300s.
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
    const last = Number.isFinite(meta.regularMarketPrice) ? meta.regularMarketPrice : closes.at(-1) || null;
    const previous = closes.length >= 2 ? closes.at(-2) : null;
    const fiveBase = closes.length ? closes.at(0) : null;
    const pct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0) ? (a / b - 1) * 100 : null;
    return {
      symbol,
      name: nameOf.get(symbol) || meta.shortName || symbol,
      price: Number.isFinite(last) ? last : null,
      currency: meta.currency || 'USD',
      oneDay: previous != null ? pct(last, previous) : (meta.regularMarketChangePercent ?? null),
      fiveDay: fiveBase != null ? pct(last, fiveBase) : null,
    };
  } catch {
    // One failing symbol must not drop the others — report it as unavailable.
    return { symbol, name: nameOf.get(symbol) || symbol, price: null, currency: null, oneDay: null, fiveDay: null };
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request) {
  const raw = request.nextUrl.searchParams.get('symbols');
  const symbols = raw ? raw.split(',').map((symbol) => symbol.trim()) : [];
  if (!symbols.length || symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol))) {
    return NextResponse.json({ error: 'symbols must be a comma-separated list of valid Yahoo symbols' }, { status: 400 });
  }
  const uniqueSymbols = [...new Set(symbols)];
  const quotes = await Promise.all(uniqueSymbols.map(quote));
  return NextResponse.json({ quotes, source: 'yahoo', updatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
