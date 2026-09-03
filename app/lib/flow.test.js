// Pure-function tests for app/lib/flow.js. Run with `node --test app/lib/flow.test.js`.
// No fetch, no React — exercises the math directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRvol,
  computeReturns,
  computePeriodReturns,
  classifyBreadth,
  directionVerdict,
  extractCloses,
  themesBySector,
  THEME_SECTORS,
  SECTORS,
  THEMES,
  allTickers,
} from './flow.js';

test('computeReturns: simple 1M return', () => {
  const closes = Array.from({ length: 25 }, (_, i) => 100 * Math.pow(1.01, i));
  const r = computeReturns(closes, 21);
  assert.ok(Math.abs(r - (Math.pow(1.01, 21) - 1) * 100) < 1e-6, `got ${r}`);
});

test('computeReturns: too short returns null', () => {
  assert.equal(computeReturns([100, 101], 5), null);
  assert.equal(computeReturns([], 5), null);
  assert.equal(computeReturns([0, 100, 100], 2), null); // zero base
});

test('computeRvol: normal case', () => {
  const volumes = [1_000_000, 1_100_000, 900_000, 1_050_000, 950_000, 1_200_000, 1_000_000, 1_100_000, 950_000, 1_050_000, 2_000_000];
  const rvol = computeRvol(volumes, 10);
  assert.ok(Math.abs(rvol - (2_000_000 / 1_030_000)) < 1e-3, `got ${rvol}`);
});

test('computeRvol: too short returns null', () => {
  assert.equal(computeRvol([1, 2, 3], 10), null);
  assert.equal(computeRvol([], 10), null);
});

test('computeRvol: zero avg returns null', () => {
  const volumes = new Array(11).fill(0);
  assert.equal(computeRvol(volumes, 10), null);
});

test('computePeriodReturns: returns all three horizons', () => {
  const closes = Array.from({ length: 70 }, (_, i) => 100 + i * 0.1);
  const out = computePeriodReturns(closes);
  assert.equal(typeof out.return1w, 'number');
  assert.equal(typeof out.return1m, 'number');
  assert.equal(typeof out.return3m, 'number');
  assert.equal(out.bars, 70);
});

test('classifyBreadth: thresholds', () => {
  assert.equal(classifyBreadth(0.9), 'broad');
  assert.equal(classifyBreadth(0.66), 'broad');
  assert.equal(classifyBreadth(0.5), 'mixed');
  assert.equal(classifyBreadth(0.33), 'mixed');
  assert.equal(classifyBreadth(0.1), 'thin');
  assert.equal(classifyBreadth(0), 'thin');
  assert.equal(classifyBreadth(NaN), 'unknown');
});

test('directionVerdict: thresholds', () => {
  assert.equal(directionVerdict(2.5), 'Leading');
  assert.equal(directionVerdict(1), 'Leading');
  assert.equal(directionVerdict(0), 'Inline');
  assert.equal(directionVerdict(-0.5), 'Inline');
  assert.equal(directionVerdict(-1.5), 'Lagging');
  assert.equal(directionVerdict(NaN), 'Unknown');
});

test('extractCloses: filters nulls and NaNs', () => {
  const result = { indicators: { quote: [{ close: [100, null, 101, NaN, 102, undefined] }] } };
  const out = extractCloses(result);
  assert.deepEqual(out, [100, 101, 102]);
});

test('extractCloses: missing shape returns []', () => {
  assert.deepEqual(extractCloses(null), []);
  assert.deepEqual(extractCloses({}), []);
  assert.deepEqual(extractCloses({ indicators: {} }), []);
});

test('themesBySector: every theme mapped to a known sector', () => {
  const map = themesBySector();
  for (const sector of SECTORS) assert.ok(Array.isArray(map[sector.name]), `missing ${sector.name}`);
  // The total should equal the number of THEMES entries (one ticker can appear
  // in several sub-themes, all of which map to its sector).
  const total = Object.values(map).reduce((sum, list) => sum + list.length, 0);
  assert.equal(total, THEMES.length);
  // Every theme ticker's sector should be in the canonical SECTORS list.
  const validNames = new Set(SECTORS.map((s) => s.name));
  for (const sectorName of Object.keys(THEME_SECTORS)) {
    assert.ok(validNames.has(THEME_SECTORS[sectorName]), `${sectorName} not in SECTORS`);
  }
});

test('allTickers: dedupes SPY, sectors, and themes', () => {
  const tickers = allTickers();
  assert.ok(tickers.includes('SPY'));
  assert.ok(tickers.includes('XLE'));
  assert.ok(tickers.includes('SMH'));
  // Duplicates are removed.
  assert.equal(new Set(tickers).size, tickers.length);
});
