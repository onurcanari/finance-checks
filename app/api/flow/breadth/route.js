import { NextResponse } from 'next/server';
import {
  SECTORS,
  BENCHMARK,
  allTickers,
  classifyBreadth,
  computePeriodReturns,
  extractCloses,
  themesBySector,
} from '../../../lib/flow.js';
import { fetchChart, CACHE_HEADER } from '../_shared.js';

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

  // Bucket themes by their declared sector — single source of truth shared
  // with app/lib/flow.js.
  const themesBySec = themesBySector();

  const result = SECTORS.map(({ ticker, name }) => {
    const sectorReturn1m = returnByTicker.get(ticker);
    const vsSpy1m = Number.isFinite(sectorReturn1m)
      ? sectorReturn1m - spyReturn1m
      : null;

    const themeEntries = themesBySec[name] || [];
    // Breadth counts *theme entries* (sub-theme rows from THEMES), NOT unique
    // tickers. A single underlying ETF can appear in several sub-themes (e.g.
    // SMH is both Semiconductors and Memory), so it is weighted per sub-theme
    // row it appears in. This is consistent with the page's sub-theme data
    // model. Participation rate = fraction of comparable theme entries in the
    // sector with a finite 1M return above SPY's. Entries without a usable
    // return don't count — they would skew the rate without telling us anything.
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
