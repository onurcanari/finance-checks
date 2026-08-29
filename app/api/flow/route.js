import { NextResponse } from 'next/server';
import {
  SECTORS,
  THEMES,
  BENCHMARK,
  allTickers,
  buildRow,
} from '../../lib/flow.js';
import { fetchChart, CACHE_HEADER } from './_shared.js';

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
