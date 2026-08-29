import { NextResponse } from 'next/server';
import {
  SECTORS,
  THEMES,
  THEME_SECTORS,
  BENCHMARK,
  allTickers,
  classifyBreadth,
  computePeriodReturns,
  extractCloses,
  extractVolumes,
} from '../../../lib/flow.js';

const YAHOO_RANGE = '3mo';
const YAHOO_INTERVAL = '1d';
const TIMEOUT_MS = 12_000;
const CACHE_HEADER = 'public, s-maxage=120, stale-while-revalidate=600';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

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

function tickerReturn(ticker, chart) {
  if (!chart) return null;
  const closes = extractCloses(chart);
  const returns = computePeriodReturns(closes);
  return returns.return1m;
}

export async function GET() {
  const tickers = allTickers();
  const charts = await Promise.all(tickers.map(fetchChart));
  const chartByTicker = new Map(tickers.map((ticker, index) => [ticker, charts[index]]));

  const spyReturn1m = tickerReturn(BENCHMARK.ticker, chartByTicker.get(BENCHMARK.ticker));
  if (!Number.isFinite(spyReturn1m)) {
    return NextResponse.json(
      { error: 'Benchmark quote unavailable', source: 'Yahoo Finance chart API', generatedAt: new Date().toISOString() },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // Resolve the per-ticker 1M return once and reuse for both the sector
  // return (which uses the sector ETF itself) and breadth (theme tickers).
  const returnByTicker = new Map();
  for (const ticker of tickers) {
    returnByTicker.set(ticker, tickerReturn(ticker, chartByTicker.get(ticker)));
  }

  // Bucket themes by their declared sector.
  const themesBySec = new Map();
  for (const sector of SECTORS) themesBySec.set(sector.name, []);
  for (const [ticker, name] of THEMES) {
    const sectorName = THEME_SECTORS[ticker];
    if (!sectorName || !themesBySec.has(sectorName)) continue;
    themesBySec.get(sectorName).push({ ticker, name });
  }

  const result = SECTORS.map(({ ticker, name }) => {
    const sectorReturn1m = returnByTicker.get(ticker);
    const vsSpy1m = Number.isFinite(sectorReturn1m)
      ? sectorReturn1m - spyReturn1m
      : null;

    const themeEntries = themesBySec.get(name) || [];
    // Participation rate = fraction of theme tickers in the sector with a
    // finite 1M return above SPY's. Themes without a usable return don't
    // count — they would skew the rate without telling us anything.
    const comparable = themeEntries.filter((theme) => Number.isFinite(returnByTicker.get(theme.ticker)));
    const participants = comparable.filter((theme) => (returnByTicker.get(theme.ticker) ?? -Infinity) > spyReturn1m);
    const breadth = comparable.length ? participants.length / comparable.length : null;
    return {
      ticker,
      name,
      return1m: sectorReturn1m,
      vsSpy1m,
      participantTickers: participants.map((theme) => `${theme.ticker} · ${theme.name}`),
      breadth,
      breadthLabel: classifyBreadth(breadth),
      themesCovered: comparable.length,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    period: '1M',
    market: BENCHMARK.ticker,
    source: 'Yahoo Finance chart API',
    sectors: result,
  }, { headers: { 'Cache-Control': CACHE_HEADER } });
}
