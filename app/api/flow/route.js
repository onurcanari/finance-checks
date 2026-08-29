import { NextResponse } from 'next/server';
import {
  SECTORS,
  THEMES,
  BENCHMARK,
  allTickers,
  computeRvol,
  computePeriodReturns,
  extractCloses,
  extractVolumes,
} from '../../lib/flow.js';

// 3 months of daily bars — covers 1W (5d), 1M (21d), 3M (63d) returns, and
// the 10d RVOL window with a small buffer. Yahoo's free chart API caps at
// ~15y for daily, so 3mo is comfortably within limits.
const YAHOO_RANGE = '3mo';
const YAHOO_INTERVAL = '1d';
const TIMEOUT_MS = 12_000;
const CACHE_HEADER = 'public, s-maxage=120, stale-while-revalidate=600';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Pull a Yahoo chart for one ticker. Returns null on any failure (network,
// 429, 404, malformed payload) — callers treat null as "unavailable" so one
// bad ticker never drops the whole response.
async function fetchChart(ticker) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${YAHOO_RANGE}&interval=${YAHOO_INTERVAL}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.indicators?.quote?.[0]) return null;
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Build a row for a single ticker from its chart result. The shape mirrors
// what the page renders: per-period returns, RVOL, and a "vs SPY" delta for
// the 1M anchor period.
function buildRow(ticker, name, chart, spyReturn1m) {
  if (!chart) {
    return { ticker, name, return1w: null, return1m: null, return3m: null, rvol: null, vsSpy1m: null, unavailable: true };
  }
  const closes = extractCloses(chart);
  const volumes = extractVolumes(chart);
  const returns = computePeriodReturns(closes);
  const rvol = computeRvol(volumes, 10);
  const vsSpy1m = Number.isFinite(returns.return1m) && Number.isFinite(spyReturn1m)
    ? returns.return1m - spyReturn1m
    : null;
  return {
    ticker,
    name,
    return1w: returns.return1w,
    return1m: returns.return1m,
    return3m: returns.return3m,
    rvol,
    vsSpy1m,
    bars: returns.bars,
  };
}

function rankSectors(rows) {
  return rows
    .filter((row) => Number.isFinite(row.return1m))
    .sort((a, b) => (b.vsSpy1m ?? -Infinity) - (a.vsSpy1m ?? -Infinity));
}

function rankThemes(rows) {
  return rows
    .filter((row) => Number.isFinite(row.return1m))
    .sort((a, b) => (b.vsSpy1m ?? -Infinity) - (a.vsSpy1m ?? -Infinity));
}

export async function GET() {
  const tickers = allTickers();
  const charts = await Promise.all(tickers.map(fetchChart));
  const chartByTicker = new Map(tickers.map((ticker, index) => [ticker, charts[index]]));

  // Benchmark first — sector and theme rows compute "vs SPY" against this.
  const spyChart = chartByTicker.get(BENCHMARK.ticker);
  const spyRow = buildRow(BENCHMARK.ticker, BENCHMARK.name, spyChart, 0);
  // If SPY itself failed the response is meaningless — bail with 502.
  if (!Number.isFinite(spyRow.return1m)) {
    return NextResponse.json(
      { error: 'Benchmark quote unavailable', source: 'Yahoo Finance chart API', generatedAt: new Date().toISOString() },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const sectorRows = SECTORS.map(({ ticker, name }) => buildRow(ticker, name, chartByTicker.get(ticker), spyRow.return1m));
  // Themes expose the sub-theme name (e.g. "Robotics") rather than the ETF
  // name — duplicates of the same ticker across sub-themes stay separate rows
  // because each sub-theme has a different descriptive identity.
  const themeRows = THEMES.map(([ticker, name]) => buildRow(ticker, name, chartByTicker.get(ticker), spyRow.return1m));

  const rankedSectors = rankSectors(sectorRows);
  const rankedThemes = rankThemes(themeRows);
  const unavailableTickers = tickers.filter((ticker) => !chartByTicker.get(ticker));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    period: '1M',
    market: BENCHMARK.ticker,
    source: 'Yahoo Finance chart API',
    benchmark: { ticker: spyRow.ticker, name: spyRow.name, return1m: spyRow.return1m, return1w: spyRow.return1w, return3m: spyRow.return3m },
    sectors: rankedSectors,
    themes: rankedThemes,
    unavailable: unavailableTickers,
  }, { headers: { 'Cache-Control': CACHE_HEADER } });
}
