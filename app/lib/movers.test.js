// Offline unit tests for app/lib/movers.js — pure AV TOP_GAINERS_LOSERS
// payload mapping. Run with `node --test app/lib/movers.test.js`.
// ZERO network calls: no fetch, no av-client import, nothing to dial out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNum, normalizeMover, normalizeMoversPayload, MOVERS_TABS } from './movers.js';

test('parseNum: plain integer and decimal numeric strings', () => {
  assert.equal(parseNum('42'), 42);
  assert.equal(parseNum('135.9477'), 135.9477);
  assert.equal(parseNum('-2.35'), -2.35);
  assert.equal(parseNum('0'), 0);
  assert.equal(parseNum('24833800'), 24833800);
});

test('parseNum: percent strings lose the % sign and parse', () => {
  assert.equal(parseNum('135.9477%'), 135.9477);
  assert.equal(parseNum('-1.25%'), -1.25);
  assert.equal(parseNum('+0.51%'), 0.51);
});

test('parseNum: thousands separators and whitespace/garbage become null', () => {
  assert.equal(parseNum('1,234.5'), null);
  assert.equal(parseNum(' 42 '), 42);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('   '), null);
  assert.equal(parseNum('n/a'), null);
  assert.equal(parseNum('24.8M'), null);
  assert.equal(parseNum('--'), null);
  assert.equal(parseNum('12% off'), null);
});

test('parseNum: null/undefined/objects/numbers pass through safely', () => {
  assert.equal(parseNum(null), null);
  assert.equal(parseNum(undefined), null);
  assert.equal(parseNum({}), null);
  assert.equal(parseNum([7]), null);
  assert.equal(parseNum(3.5), 3.5);
  assert.equal(parseNum(-7), -7);
  assert.equal(parseNum(NaN), null);
  assert.equal(parseNum(Infinity), null);
});

test('normalizeMover: full AV entry maps every field', () => {
  const mover = normalizeMover({ ticker: 'AMD', price: '163.15', change_amount: '4.92', change_percentage: '3.11%', volume: '24833800' });
  assert.deepEqual(mover, {
    ticker: 'AMD',
    price: 163.15,
    changeAmount: 4.92,
    changePercentage: 3.11,
    volume: 24833800,
    unavailable: false,
  });
});

test('normalizeMover: negative change keeps its sign for the up/down class', () => {
  assert.equal(normalizeMover({ ticker: 'XYZ', price: '10', change_amount: '-0.4', change_percentage: '-3.85%', volume: '1000' }).changePercentage, -3.85);
});

test('normalizeMover: missing/garbage price -> row marked unavailable, numbers null', () => {
  const missing = normalizeMover({ ticker: 'BROKEN' });
  assert.equal(missing.ticker, 'BROKEN');
  assert.equal(missing.price, null);
  assert.equal(missing.unavailable, true);

  const noTicker = normalizeMover({ price: '10' });
  assert.equal(noTicker.ticker, '');
  assert.equal(noTicker.unavailable, true);

  const garbage = normalizeMover({ ticker: 'BAD', price: 'high', change_amount: 'x', change_percentage: 'y', volume: 'z' });
  assert.equal(garbage.price, null);
  assert.equal(garbage.changeAmount, null);
  assert.equal(garbage.changePercentage, null);
  assert.equal(garbage.volume, null);
  assert.equal(garbage.unavailable, true);
});

test('normalizeMoversPayload: maps the three AV arrays and tolerates missing arrays', () => {
  const payload = {
    top_gainers: [{ ticker: 'A', price: '1', change_amount: '0.1', change_percentage: '10%', volume: '5' }],
    top_losers: [{ ticker: 'B', price: '2', change_amount: '-0.2', change_percentage: '-9%', volume: '6' }],
    most_actively_traded: [{ ticker: 'C', price: '3', change_amount: '0.0', change_percentage: '0%', volume: '99999999' }],
  };
  const mapped = normalizeMoversPayload(payload);
  assert.deepEqual(mapped.gainers, [{ ticker: 'A', price: 1, changeAmount: 0.1, changePercentage: 10, volume: 5, unavailable: false }]);
  assert.equal(mapped.losers[0].changePercentage, -9);
  assert.equal(mapped.active[0].volume, 99999999);

  const empty = normalizeMoversPayload({});
  assert.deepEqual(empty, { gainers: [], losers: [], active: [] });
});

test('MOVERS_TABS: three fixed tabs in contract order', () => {
  assert.deepEqual(MOVERS_TABS.map((tab) => tab.key), ['gainers', 'losers', 'active']);
});
