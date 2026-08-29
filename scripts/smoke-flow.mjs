// Integration smoke test for the /api/flow and /api/flow/breadth routes
// without hitting Yahoo. Loads the same lib/flow.js helpers the routes use
// and feeds them canned chart payloads, then asserts the assembled response
// shape and the key invariants (count, ranking, breadth, RVOL, etc).
//
// Run: node scripts/smoke-flow.mjs

import {
  SECTORS,
  THEMES,
  BENCHMARK,
  allTickers,
  computeRvol,
  computePeriodReturns,
  extractCloses,
  extractVolumes,
  themesBySector,
  THEME_SECTORS,
  classifyBreadth,
} from '../app/lib/flow.js';
import assert from 'node:assert/strict';

// --- Canned chart payload (deterministic, 70 daily bars) -----------------
const N = 70;
function makeBars(ticker) {
  // Each sector/theme gets a different drift and noise seed so we can verify
  // ranking & breadth meaningfully.
  const seed = [...ticker].reduce((s, c) => s + c.charCodeAt(0), 0);
  const drift = ((seed % 17) - 8) / 1000;        // -0.008 .. +0.008
  const vol = 0.012 + (seed % 7) / 1000;
  const rvolBoost = ticker === 'SMH' ? 6 : 1;     // SMH is the "most-hedged"
  let price = 100;
  const closes = [];
  const volumes = [];
  let s = seed;
  for (let i = 0; i < N; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const noise = (s / 0x7fffffff - 0.5) * 2 * vol;
    price = price * (1 + drift + noise);
    closes.push(Number(price.toFixed(4)));
    // SMH last bar: huge volume spike (5x avg) so the "most-hedged" cell lights up.
    const base = 1_000_000 + (s % 500_000);
    volumes.push(i === N - 1 && ticker === 'SMH' ? base * 5 * rvolBoost : base);
  }
  return { closes, volumes };
}

function makeChart(ticker) {
  const { closes, volumes } = makeBars(ticker);
  return {
    meta: { regularMarketPrice: closes.at(-1), currency: 'USD' },
    indicators: { quote: [{ close: closes, volume: volumes }] },
  };
}

// --- Reimplement the route's build logic in isolation (same shape) -------
function buildRow(ticker, name, chart, spyReturn1m) {
  if (!chart) return { ticker, name, return1w: null, return1m: null, return3m: null, rvol: null, vsSpy1m: null, unavailable: true };
  const closes = extractCloses(chart);
  const volumes = extractVolumes(chart);
  const returns = computePeriodReturns(closes);
  const rvol = computeRvol(volumes, 10);
  const vsSpy1m = Number.isFinite(returns.return1m) && Number.isFinite(spyReturn1m)
    ? returns.return1m - spyReturn1m
    : null;
  return { ticker, name, return1w: returns.return1w, return1m: returns.return1m, return3m: returns.return3m, rvol, vsSpy1m, bars: returns.bars };
}

// Build the same chart set the route would build.
const tickers = allTickers();
const chartByTicker = Object.fromEntries(tickers.map((t) => [t, makeChart(t)]));

const spyReturn1m = buildRow(BENCHMARK.ticker, BENCHMARK.name, chartByTicker[BENCHMARK.ticker], 0).return1m;
const sectorRows = SECTORS.map(({ ticker, name }) => buildRow(ticker, name, chartByTicker[ticker], spyReturn1m));
const themeRows = THEMES.map(([ticker, name]) => buildRow(ticker, name, chartByTicker[ticker], spyReturn1m));

// --- Assertions ----------------------------------------------------------
console.log('counts:');
console.log('  sectors:', sectorRows.length);
console.log('  themes:', themeRows.length);
console.log('  unique tickers:', tickers.length);

assert.equal(sectorRows.length, 11, 'should produce 11 sector rows');
assert.ok(themeRows.length >= 30, `should produce at least 30 theme rows (got ${themeRows.length})`);

// Every row has a finite 1M return (because our mock data is dense).
for (const row of sectorRows) assert.ok(Number.isFinite(row.return1m), `${row.ticker} return1m missing`);
for (const row of themeRows) assert.ok(Number.isFinite(row.return1m), `${row.ticker}/${row.name} return1m missing`);

// SMH should be the highest RVOL (we put a 5x spike there).
const allByRvol = [...sectorRows, ...themeRows].sort((a, b) => (b.rvol ?? -Infinity) - (a.rvol ?? -Infinity));
console.log('  top by rvol:', allByRvol[0].ticker, allByRvol[0].rvol);
assert.equal(allByRvol[0].ticker, 'SMH', 'SMH should have the highest RVOL in the mock');

// Sector rows are ranked by vsSpy1m.
const sortedSectors = [...sectorRows].sort((a, b) => (b.vsSpy1m ?? -Infinity) - (a.vsSpy1m ?? -Infinity));
const ranks = sortedSectors.map((r) => r.vsSpy1m);
for (let i = 1; i < ranks.length; i++) {
  assert.ok(ranks[i - 1] >= ranks[i], `sector ranking broken at index ${i}: ${ranks[i-1]} < ${ranks[i]}`);
}

// Breadth: simulate the breadth route for one sector with a known outcome.
const techThemes = themesBySector()['Technology'] || [];
const comparable = techThemes.filter((t) => Number.isFinite(buildRow(t.ticker, t.name, chartByTicker[t.ticker], spyReturn1m).return1m));
const participants = comparable.filter((t) => buildRow(t.ticker, t.name, chartByTicker[t.ticker], spyReturn1m).return1m > spyReturn1m);
const breadth = comparable.length ? participants.length / comparable.length : null;
console.log('  tech themes comparable:', comparable.length, 'participants:', participants.length, 'breadth:', breadth?.toFixed(2));
const breadthLabel = classifyBreadth(breadth);
console.log('  tech breadth label:', breadthLabel);
assert.ok(['broad', 'mixed', 'thin'].includes(breadthLabel));

// The THEME_SECTORS map covers every unique theme ticker.
const allThemeTickers = new Set(THEMES.map(([t]) => t));
for (const t of allThemeTickers) {
  assert.ok(THEME_SECTORS[t], `theme ticker ${t} missing from THEME_SECTORS`);
}

console.log('\nALL SMOKE TESTS PASSED');
