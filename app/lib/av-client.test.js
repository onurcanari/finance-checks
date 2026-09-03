// Offline unit tests for app/lib/av-client.js. Run with
// `node --test app/lib/av-client.test.js`.
//
// ZERO live network calls: fetch and the clock are injected through
// resetCacheForTests(), and each test gets its own temp cache dir.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { avFetch, resetCacheForTests } from './av-client.js';

const PAYLOAD = { symbol: 'AMD', trades: [{ politician: 'Hon. Test', transaction_date: '2026-07-14' }] };
const OTHER_PAYLOAD = { symbol: 'AMD', trades: [{ politician: 'Hon. Refreshed', transaction_date: '2026-08-01' }] };

let tmp;
let nowMs;
let fetchCalls;

function fixedClock() {
  return new Date(nowMs);
}

// Fake fetcher: records calls and replies per-test via `handler`.
function fakeFetcher(handler) {
  return async (url) => {
    fetchCalls.push(url);
    return handler(url);
  };
}

function okResponse(body) {
  return { ok: true, status: 200, json: async () => body };
}

function setEnv() {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  process.env.AV_DAILY_LIMIT = '25';
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'av-cache-test-'));
  nowMs = Date.UTC(2026, 8, 1, 12, 0, 0); // 2026-09-01T12:00:00Z
  fetchCalls = [];
  setEnv();
  resetCacheForTests({ dir: tmp, clock: fixedClock, fetcher: fakeFetcher(() => okResponse(PAYLOAD)) });
});

afterEach(() => {
  delete process.env.ALPHA_VANTAGE_API_KEY;
  delete process.env.AV_DAILY_LIMIT;
  delete process.env.AV_CACHE_DIR;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('(a) fresh cache hit serves cache without calling fetch', async () => {
  // Prime the cache.
  const first = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(first.error, null);
  assert.equal(first.stale, false);
  assert.equal(first.fetchedAt, '2026-09-01T12:00:00.000Z');
  assert.deepEqual(first.data, PAYLOAD);
  assert.equal(fetchCalls.length, 1);

  // A few hours later, still inside the TTL.
  nowMs += 3 * 60 * 60 * 1000;
  const second = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(fetchCalls.length, 1, 'no additional fetch expected');
  assert.equal(second.stale, false);
  assert.equal(second.fetchedAt, '2026-09-01T12:00:00.000Z');
  assert.deepEqual(second.data, PAYLOAD);
  assert.notEqual(second.data, PAYLOAD, 'data must be a parsed copy, not the same object identity');
});

test('(b) expired cache triggers one fetch and refreshes cache', async () => {
  await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(fetchCalls.length, 1);

  nowMs += 2 * 86_400 * 1000; // two days later: TTL expired
  resetCacheForTests({ fetcher: fakeFetcher(() => okResponse(OTHER_PAYLOAD)) });

  const result = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(fetchCalls.length, 2, 'exactly one live refresh expected');
  assert.equal(result.stale, false);
  assert.equal(result.fetchedAt, '2026-09-03T12:00:00.000Z', 'fetchedAt is the new fetch time');
  assert.deepEqual(result.data, OTHER_PAYLOAD);
  assert.equal(result.error, null);

  // And the refreshed value is now cached fresh.
  const again = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(fetchCalls.length, 2);
  assert.deepEqual(again.data, OTHER_PAYLOAD);
});

test('(c) live failure serves stale copy with the OLD fetchedAt', async () => {
  await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 3_600 });
  nowMs += 2 * 3_600 * 1000; // expire

  for (const [name, handler] of [
    ['network error', () => { throw new Error('ECONNRESET'); }],
    ['non-200', () => ({ ok: false, status: 503, json: async () => ({}) })],
    ['429', () => ({ ok: false, status: 429, json: async () => ({}) })],
    ['AV error payload (Information)', () => okResponse({ Information: 'premium endpoint' })],
    ['AV error payload (Error Message)', () => okResponse({ 'Error Message': 'invalid API call' })],
  ]) {
    resetCacheForTests({ fetcher: fakeFetcher(handler) });
    const result = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 3_600 });
    assert.equal(result.stale, true, `${name}: must be marked stale`);
    assert.equal(result.fetchedAt, '2026-09-01T12:00:00.000Z', `${name}: keeps old fetchedAt`);
    assert.deepEqual(result.data, PAYLOAD, `${name}: still serves cached payload`);
    assert.ok(result.error, `${name}: carries an error reason`);
  }
});

test('(c2) failure with NO cache at all returns data:null + error', async () => {
  resetCacheForTests({ fetcher: fakeFetcher(() => { throw new Error('boom'); }) });
  const result = await avFetch('CONGRESS_TRADES', { symbol: 'NOPE' }, { ttlSeconds: 86_400 });
  assert.equal(result.data, null);
  assert.equal(result.fetchedAt, null);
  assert.equal(result.stale, false);
  assert.ok(result.error.includes('boom'));
});

test('(d) quota counter blocks live calls at the daily limit and serves stale', async () => {
  process.env.AV_DAILY_LIMIT = '2';

  // Two distinct symbols -> two real live calls -> quota now at 2.
  await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 3_600 });
  await avFetch('CONGRESS_TRADES', { symbol: 'ALAB' }, { ttlSeconds: 3_600 });
  assert.equal(fetchCalls.length, 2);

  nowMs += 2 * 3_600 * 1000; // expire everything

  // Third symbol never fetched: quota guard fires BEFORE the network.
  resetCacheForTests({ fetcher: fakeFetcher(() => okResponse(PAYLOAD)) });
  const uncached = await avFetch('CONGRESS_TRADES', { symbol: 'RKLB' }, { ttlSeconds: 3_600 });
  assert.equal(fetchCalls.length, 2, 'quota-exhausted call must not touch the network');
  assert.equal(uncached.data, null);
  assert.equal(uncached.error, 'daily_quota_exhausted');

  // Previously cached symbol: quota guard serves the STALE copy.
  const stale = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 3_600 });
  assert.equal(fetchCalls.length, 2, 'no network even with cache available');
  assert.equal(stale.stale, true);
  assert.equal(stale.fetchedAt, '2026-09-01T12:00:00.000Z');
  assert.deepEqual(stale.data, PAYLOAD);
  assert.equal(stale.error, 'daily_quota_exhausted');
});

test('(d3) AV_DAILY_LIMIT=0 blocks every live call, even with an empty cache', async () => {
  process.env.AV_DAILY_LIMIT = '0';
  const result = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(fetchCalls.length, 0, 'limit 0 must not dial out');
  assert.equal(result.data, null);
  assert.equal(result.error, 'daily_quota_exhausted');
});

test('(d2) quota counter is per UTC day', async () => {
  process.env.AV_DAILY_LIMIT = '1';
  await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 1_000 });
  assert.equal(fetchCalls.length, 1);

  nowMs += 86_400 * 1000; // next UTC day
  await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 1_000 });
  assert.equal(fetchCalls.length, 2, 'new day resets the quota counter');
});

test('(e) missing API key returns config_missing without touching network or cache', async () => {
  delete process.env.ALPHA_VANTAGE_API_KEY;
  const result = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.deepEqual(result, { data: null, fetchedAt: null, stale: false, error: 'config_missing' });
  assert.equal(fetchCalls.length, 0);
  assert.equal(fs.existsSync(path.join(tmp, 'congress-trades')), false, 'no cache files written');
});

test('(f) disk cache survives a cold process (memory layer empty)', async () => {
  await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(fetchCalls.length, 1);

  // Simulate a cold start: fresh module registry via querystring import is not
  // possible here, so instead point the client at the same dir but verify the
  // disk file exists and would satisfy a fresh-hit read.
  const files = fs.readdirSync(tmp);
  const entry = JSON.parse(fs.readFileSync(path.join(tmp, files[0]), 'utf8'));
  assert.equal(entry.fetchedAt, '2026-09-01T12:00:00.000Z');
  assert.deepEqual(entry.payload, PAYLOAD);

  // Same dir, empty memory layer: a fresh-hit read comes from disk alone.
  resetCacheForTests({ dir: tmp }); // clears memoryCache, keeps dir + disk files
  const fromDisk = await avFetch('CONGRESS_TRADES', { symbol: 'AMD' }, { ttlSeconds: 86_400 });
  assert.equal(fetchCalls.length, 1, 'disk cache served without network');
  assert.equal(fromDisk.stale, false);
  assert.deepEqual(fromDisk.data, PAYLOAD);
});
