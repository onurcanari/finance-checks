import { NextResponse } from 'next/server';

const SYMBOLS = ['TRY=X', 'GC=F', 'XU100.IS'];
const GRAM_TROY = 31.1035;

// Convert a "YYYY-MM" month key to a zero-based absolute month index, so the
// span between two keys can be measured directly in months.
function monthIndex(key) {
  const [year, month] = key.split('-').map(Number);
  return year * 12 + (month - 1);
}

// Fetch 12 months of monthly closes as a Map of "YYYY-MM" -> close.
// Mapping by calendar month (rather than array index) keeps pairwise
// series aligned even when a symbol has missing/extra monthly bars.
async function monthlyCloses(symbol, signal) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1mo`, { signal, next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
  const result = (await response.json())?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
  const byMonth = new Map();
  timestamps.forEach((timestamp, index) => {
    const value = closes[index];
    if (!Number.isFinite(value)) return;
    const month = new Date(timestamp * 1000).toISOString().slice(0, 7);
    byMonth.set(month, value); // later bars in the same month win
  });
  // Reject when the earliest->latest month span isn't ~12 months, so the
  // "12M NOMINAL" label is only used for genuine year-over-year comparisons.
  if (byMonth.size < 2) throw new Error(`${symbol}: incomplete series`);
  const keys = [...byMonth.keys()];
  if (Math.abs((monthIndex(keys.at(-1)) - monthIndex(keys[0])) - 12) > 2) {
    throw new Error(`${symbol}: incomplete 12M coverage`);
  }
  return byMonth;
}

function sortedValues(byMonth) {
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, value]) => value);
}

function change(series) {
  const first = series[0];
  const last = series.at(-1);
  if (!Number.isFinite(first) || !Number.isFinite(last)) throw new Error('Invalid series');
  const value = (last / first - 1) * 100;
  if (!Number.isFinite(value)) throw new Error('Invalid 12M change');
  return value;
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const [usdTry, goldUsd, bist] = await Promise.all(SYMBOLS.map((symbol) => monthlyCloses(symbol, controller.signal)));

    // Gram gold in TRY = XAUUSD (USD per troy oz) * USD/TRY / grams-per-troy-oz,
    // computed over the calendar months present in both series.
    const gram = new Map();
    for (const [month, rate] of usdTry) {
      if (goldUsd.has(month)) gram.set(month, (goldUsd.get(month) * rate) / GRAM_TROY);
    }
    if (gram.size < 2) throw new Error('GRAM GOLD (TRY): incomplete paired series');

    const rows = [
      { symbol: 'TRY=X', label: 'USD/TRY', twelveMonthChange: change(sortedValues(usdTry)) },
      { symbol: 'XAUTRY-GRAM', label: 'GRAM GOLD (TRY)', twelveMonthChange: change(sortedValues(gram)) },
      { symbol: 'XU100.IS', label: 'BIST 100', twelveMonthChange: change(sortedValues(bist)) },
    ];
    return NextResponse.json(
      { source: 'Yahoo Finance chart API', fetchedAt: new Date().toISOString(), rows },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
    );
  } catch (error) {
    // Log the underlying failure for debugging while keeping the public 502.
    console.error('[tr-macro] failed to build TR macro snapshot:', error);
    return NextResponse.json(
      { error: 'TR macro data is unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}