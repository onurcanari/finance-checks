import { NextResponse } from 'next/server';

const SYMBOLS = ['TRY=X', 'GC=F', 'XU100.IS'];
const GRAM_TROY = 31.1035;

async function closes(symbol, signal) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1mo`, { signal, next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
  const result = (await response.json())?.chart?.result?.[0];
  const raw = result?.indicators?.quote?.[0]?.close;
  return (Array.isArray(raw) ? raw : []).filter(Number.isFinite);
}

function change(series) {
  if (!Array.isArray(series) || series.length < 2) throw new Error('Incomplete Yahoo series');
  const first = series[0];
  const last = series.at(-1);
  if (!Number.isFinite(first) || !Number.isFinite(last)) throw new Error('Incomplete Yahoo series');
  const value = (last / first - 1) * 100;
  if (!Number.isFinite(value)) throw new Error('Invalid 12M change');
  return value;
}

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    // Fetch each symbol independently so one failure (e.g. a thin BIST series)
    // never takes down the whole endpoint.
    const [usdTryRes, goldUsdRes, bistRes] = await Promise.all(
      SYMBOLS.map(async (symbol) => {
        try {
          return { symbol, series: await closes(symbol, controller.signal) };
        } catch {
          return { symbol, series: null };
        }
      }),
    );

    const usdTry = usdTryRes.series;
    const goldUsd = goldUsdRes.series;
    const bist = bistRes.series;

    const rows = [];
    if (usdTry && goldUsd) {
      const span = Math.min(usdTry.length, goldUsd.length);
      rows.push({
        symbol: 'TRY=X',
        label: 'USD/TRY',
        twelveMonthChange: change(usdTry),
      });
      const gramTry = usdTry.slice(0, span).map((rate, index) => (goldUsd[index] * rate) / GRAM_TROY);
      rows.push({
        symbol: 'XAUTRY-GRAM',
        label: 'GRAM GOLD (TRY)',
        twelveMonthChange: change(gramTry),
      });
    } else if (usdTry) {
      rows.push({ symbol: 'TRY=X', label: 'USD/TRY', twelveMonthChange: change(usdTry) });
    }
    if (bist) {
      rows.push({ symbol: 'XU100.IS', label: 'BIST 100', twelveMonthChange: change(bist) });
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'TR macro data is unavailable.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { source: 'Yahoo Finance chart API', updatedAt: new Date().toISOString(), rows },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'TR macro data is unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}