// Offline unit tests for app/lib/skew.js + app/lib/skew-store.js. Run with
// `node --test app/lib/skew.test.js`.
//
// ZERO live network calls: the chain is a synthetic fixture and the store
// points at a fresh temp dir per test.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeSkew } from './skew.js';
import { upsertToday, weeklyChange, latestSnapshot } from './skew-store.js';

// --- Synthetic chain fixture ----------------------------------------------
// Strikes 90..110 (step 2, i = 0..10). Delta ladder is fixed:
//   call delta = (110 − strike) / 20  → 1.0 at 90 … 0.0 at 110
//   put delta  = call delta − 1
// IVs are configurable per side; defaults:
//   call iv = 0.40 − 0.02i  (0.40 … 0.20, falling with strike)
//   put iv  = 0.30          (flat)
// ATM (call+put)/2 at strike 90+2i is then 0.35 − 0.01i.
function makeChain({ callIvBase = 0.4, callIvStep = -0.02, putIvBase = 0.3, putIvStep = 0 } = {}) {
  const calls = [];
  const puts = [];
  for (let i = 0; i <= 10; i += 1) {
    const strike = 90 + i * 2;
    const callDelta = (110 - strike) / 20;
    calls.push({ strike, iv: callIvBase + callIvStep * i, delta: callDelta });
    puts.push({ strike, iv: putIvBase + putIvStep * i, delta: callDelta - 1 });
  }
  return { calls, puts, spot: null };
}

// --- computeSkew -----------------------------------------------------------

test('computeSkew: ATM IV interpolates when spot sits exactly between strikes', () => {
  const chain = makeChain();
  // Spot 99 sits between 98 and 100. ATM average at 98: (0.32 + 0.30)/2 = 0.31;
  // at 100: (0.30 + 0.30)/2 = 0.30. Midpoint → 0.305.
  const result = computeSkew(chain, 99);
  assert.ok(!result.error, `unexpected error ${result.error}`);
  assert.ok(Math.abs(result.atmIv - 0.305) < 1e-9, `atmIv ${result.atmIv}`);
  // Exact-hit spot uses the nearest strike's average directly.
  const exact = computeSkew(chain, 100);
  assert.ok(Math.abs(exact.atmIv - 0.3) < 1e-9, `atmIv ${exact.atmIv}`);
});

test('computeSkew: 25-delta wing IVs are linearly interpolated', () => {
  const chain = makeChain();
  // Call +0.25 delta sits between strike 104 (Δ0.30, iv 0.26) and 106
  // (Δ0.20, iv 0.24) → halfway on the delta ladder → iv 0.25.
  // Put −0.25 delta sits between strike 94 (Δ−0.20) and 96 (Δ−0.30), both
  // iv 0.30 (flat put wing) → iv 0.30.
  const result = computeSkew(chain, 100);
  assert.ok(!result.error);
  assert.ok(Math.abs(result.callIv - 0.25) < 1e-9, `callIv ${result.callIv}`);
  assert.ok(Math.abs(result.putIv - 0.3) < 1e-9, `putIv ${result.putIv}`);
});

test('computeSkew: skew formula (putIV − callIV) / atmIV', () => {
  const chain = makeChain();
  // ATM at exact strike 100 = 0.30; wings: put 0.30, call 0.25.
  const expected = (0.3 - 0.25) / 0.3;
  const result = computeSkew(chain, 100);
  assert.ok(Math.abs(result.skew - expected) < 1e-9, `skew ${result.skew}`);
  assert.equal(result.unreliable, false);
});

test('computeSkew: outlier |skew| > 0.5 flags unreliable but keeps the number', () => {
  // Flat call wing 0.30, flat put wing 0.54 → ATM (0.30+0.54)/2 = 0.42 →
  // skew = 0.24 / 0.42 ≈ 0.571 > 0.5.
  const chain = makeChain({ callIvBase: 0.3, callIvStep: 0, putIvBase: 0.54, putIvStep: 0 });
  const result = computeSkew(chain, 100);
  assert.ok(!result.error);
  assert.ok(Math.abs(result.skew - 0.24 / 0.42) < 1e-9, `skew ${result.skew}`);
  assert.equal(result.unreliable, true);
});

test('computeSkew: insufficient chain → { error }', () => {
  assert.deepEqual(computeSkew(null, 100), { error: 'insufficient_chain' });
  assert.deepEqual(computeSkew({}, 100), { error: 'insufficient_chain' });
  assert.deepEqual(computeSkew({ calls: [], puts: [] }, 100), { error: 'insufficient_chain' });
  assert.deepEqual(computeSkew(makeChain(), 0), { error: 'insufficient_chain' });
  assert.deepEqual(computeSkew(makeChain(), NaN), { error: 'insufficient_chain' });
  // IVs present but deltas missing → no usable wings.
  const noDeltas = {
    calls: [{ strike: 100, iv: 0.3, delta: null }],
    puts: [{ strike: 100, iv: 0.3, delta: null }],
  };
  assert.deepEqual(computeSkew(noDeltas, 100), { error: 'insufficient_chain' });
});

// --- skew-store ------------------------------------------------------------

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skew-store-test-'));
  process.env.SKEW_STORE_DIR = tmp;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.SKEW_STORE_DIR;
});

test('upsertToday: writes one point per date; same-day recompute overwrites', () => {
  const day1 = () => new Date(Date.UTC(2026, 8, 1, 12)).getTime();
  const day1Again = () => new Date(Date.UTC(2026, 8, 1, 18)).getTime();
  const day2 = () => new Date(Date.UTC(2026, 8, 2, 12)).getTime();

  upsertToday('AMD', { skew: 0.1, atmIV: 0.3, putIV: 0.32, callIV: 0.28 }, day1);
  upsertToday('AMD', { skew: 0.12, atmIV: 0.31, putIV: 0.33, callIV: 0.29 }, day1Again);
  upsertToday('AMD', { skew: 0.2, atmIV: 0.32, putIV: 0.34, callIV: 0.3 }, day2);

  const raw = JSON.parse(fs.readFileSync(path.join(tmp, 'AMD.json'), 'utf8'));
  assert.equal(raw.history.length, 2); // same-day rewrite did not duplicate
  assert.equal(raw.history[0].skew, 0.12); // overwritten in place
  assert.equal(raw.history[1].skew, 0.2);
});

test('weeklyChange: latest − baseline(≥5 days older); null under 2 points', () => {
  const at = (y, m, d) => () => new Date(Date.UTC(y, m, d, 12)).getTime();

  assert.equal(weeklyChange('RKLB', at(2026, 8, 10)), null); // empty store

  upsertToday('RKLB', { skew: 0.05, atmIV: 0.4, putIV: 0.45, callIV: 0.35 }, at(2026, 8, 3));
  assert.equal(weeklyChange('RKLB', at(2026, 8, 10)), null); // single point

  upsertToday('RKLB', { skew: 0.15, atmIV: 0.4, putIV: 0.45, callIV: 0.35 }, at(2026, 8, 10));
  assert.ok(Math.abs(weeklyChange('RKLB', at(2026, 8, 10)) - 0.1) < 1e-9); // 7 days apart
});

test('weeklyChange: newest entry 3 days old is not a baseline (picks older one)', () => {
  const at = (y, m, d) => () => new Date(Date.UTC(y, m, d, 12)).getTime();
  upsertToday('ALAB', { skew: 0.0, atmIV: 0.4, putIV: 0.45, callIV: 0.35 }, at(2026, 8, 1));
  upsertToday('ALAB', { skew: 0.1, atmIV: 0.4, putIV: 0.45, callIV: 0.35 }, at(2026, 8, 6));
  upsertToday('ALAB', { skew: 0.2, atmIV: 0.4, putIV: 0.5, callIV: 0.3 }, at(2026, 8, 9));
  // Now = Sep 9. Baseline must be the Sep 1 point (Sep 6 is only 3 days back).
  assert.ok(Math.abs(weeklyChange('ALAB', at(2026, 8, 9)) - 0.2) < 1e-9);
});

test('weeklyChange: entries exactly 5 days old qualify as baseline', () => {
  const at = (y, m, d) => () => new Date(Date.UTC(y, m, d, 12)).getTime();
  upsertToday('AAOI', { skew: 0.3, atmIV: 0.4, putIV: 0.45, callIV: 0.35 }, at(2026, 8, 4));
  upsertToday('AAOI', { skew: 0.1, atmIV: 0.4, putIV: 0.45, callIV: 0.35 }, at(2026, 8, 9));
  // Exactly 5×86400s between the two dates → qualifies (age == cutoff).
  assert.ok(Math.abs(weeklyChange('AAOI', at(2026, 8, 9)) - (-0.2)) < 1e-9);
});

test('latestSnapshot: returns newest point or null', () => {
  const at = (y, m, d) => () => new Date(Date.UTC(y, m, d, 12)).getTime();
  assert.equal(latestSnapshot('XYZ'), null);
  upsertToday('XYZ', { skew: 0.4, atmIV: 0.4, putIV: 0.5, callIV: 0.3 }, at(2026, 8, 2));
  upsertToday('XYZ', { skew: 0.5, atmIV: 0.4, putIV: 0.5, callIV: 0.3 }, at(2026, 8, 5));
  const snap = latestSnapshot('XYZ');
  assert.equal(snap.skew, 0.5);
  assert.equal(snap.date, '2026-09-05');
});
