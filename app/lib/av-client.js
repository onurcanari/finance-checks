// Cache-first Alpha Vantage client. Every AV-backed panel route must go
// through this module instead of calling the AV API directly: it guarantees
// "always data" semantics — a fresh disk/memory cache when possible, a clearly
// labeled STALE copy when the live call fails or the daily quota is exhausted,
// and an explicit error only when there is truly nothing to show.
//
// Public surface:
//   avFetch(func, params, { ttlSeconds }) -> { data, fetchedAt, stale, error }
//   resetCacheForTests({ dir, clock, fetcher })  (test-only)
//
// Two cache layers:
//   - in-memory Map (per process)
//   - disk JSON store, one file per func+params, hashed filename:
//       { fetchedAt, payload }
// plus a daily quota counter file: quota-<YYYY-MM-DD>.json { date, used }.
//
// No third-party dependencies (fetch / fs only), so tests run fully offline
// with an injected fetch and clock.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const AV_ENDPOINT = 'https://www.alphavantage.co/query';
const DEFAULT_DAILY_LIMIT = 25;
const LIVE_TIMEOUT_MS = 10_000;

// Mutable test seams. Production code never touches these; tests override
// them through resetCacheForTests().
const internals = {
  clock: () => new Date(),
  fetcher: (url, init) => fetch(url, init),
};

// In-memory layer: key -> { fetchedAt, payload }. Kept module-level so every
// route handler in the same process shares the cache.
const memoryCache = new Map();

function cacheDir() {
  return process.env.AV_CACHE_DIR || path.join(process.cwd(), '.av-cache');
}

function dailyLimit() {
  const parsed = parseInt(process.env.AV_DAILY_LIMIT, 10);
  // 0 is a valid value: it deterministically blocks all live calls and pins
  // every panel to the cache (stale-labeled). Invalid/negative -> default.
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

// Stable key: one cache file per func+params combination.
function cacheKey(func, params) {
  const normalized = Object.keys(params)
    .filter((key) => params[key] != null)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const hash = createHash('sha256').update(`${func}|${normalized}`).digest('hex').slice(0, 24);
  return `${func.toLowerCase()}-${hash}`;
}

function readCacheFile(file) {
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!entry || typeof entry.fetchedAt !== 'string') return null;
    return entry;
  } catch {
    return null; // unreadable/corrupt cache is treated as missing
  }
}

function writeCacheFile(file, entry) {
  // Note: this write (like writeQuota below) is not atomic — a crash mid-write
  // can leave a truncated cache file, which readCacheFile() then treats as
  // missing and the next live call refetches. Accepted risk: the blast radius
  // is one file for one day (quota counters reset daily), so no fsync/atomic
  // rename machinery is warranted here.
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entry), 'utf8');
}

function readQuota(dir) {
  try {
    const entry = JSON.parse(fs.readFileSync(quotaFile(dir), 'utf8'));
    if (entry && entry.date === todayKey() && Number.isFinite(entry.used)) {
      return entry.used;
    }
  } catch {
    // missing/corrupt counter -> treat as zero usage
  }
  return 0;
}

function writeQuota(dir, used) {
  // Same non-atomic write caveat as writeCacheFile: a crash mid-write can lose
  // the day's counter; the next successful live call recreates it and the
  // daily reset caps the impact. Kept deliberately simple (no fsync/rename).
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(quotaFile(dir), JSON.stringify({ date: todayKey(), used }), 'utf8');
}

function quotaFile(dir) {
  return path.join(dir, `quota-${todayKey()}.json`);
}

function todayKey(now = internals.clock()) {
  // YYYY-MM-DD in UTC, matching AV's daily reset semantics closely enough
  // for a 25/day budget.
  return now.toISOString().slice(0, 10);
}

function isFresh(entry, ttlSeconds, nowMs) {
  if (!entry || typeof entry.fetchedAt !== 'string') return false;
  const fetchedMs = Date.parse(entry.fetchedAt);
  if (!Number.isFinite(fetchedMs)) return false;
  return nowMs - fetchedMs < ttlSeconds * 1000;
}

// AV signals failure with payload keys instead of HTTP codes.
function errorKey(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  for (const key of ['Information', 'Note', 'Error Message']) {
    if (typeof payload[key] === 'string' && payload[key].trim()) return key;
  }
  return null;
}

function shortReason(message) {
  return String(message || 'unknown_error').slice(0, 120);
}

export async function avFetch(func, params = {}, { ttlSeconds = 86_400 } = {}) {
  const now = internals.clock();
  const nowMs = now.getTime();
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return { data: null, fetchedAt: null, stale: false, error: 'config_missing' };
  }

  const dir = cacheDir();
  const file = path.join(dir, `${cacheKey(func, params)}.json`);

  const diskEntry = readCacheFile(file);
  const memoryEntry = memoryCache.get(file) || null;
  // Prefer whichever layer saw the newest successful fetch.
  const cached =
    memoryEntry && (!diskEntry || Date.parse(memoryEntry.fetchedAt) > Date.parse(diskEntry.fetchedAt))
      ? memoryEntry
      : diskEntry;

  // 1. Fresh cache wins outright — no network, no quota. Payload is cloned so
  // a mutating consumer cannot corrupt the shared cache layers.
  if (isFresh(cached, ttlSeconds, nowMs)) {
    return { data: structuredClone(cached.payload), fetchedAt: cached.fetchedAt, stale: false, error: null };
  }

  // 2. Daily quota guard: deterministic "always data" even before we dial out.
  if (readQuota(dir) >= dailyLimit()) {
    if (cached) {
      return { data: structuredClone(cached.payload), fetchedAt: cached.fetchedAt, stale: true, error: 'daily_quota_exhausted' };
    }
    return { data: null, fetchedAt: null, stale: false, error: 'daily_quota_exhausted' };
  }

  // 3. Live call.
  const search = new URLSearchParams({ function: func, ...params, apikey: apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIVE_TIMEOUT_MS);
  try {
    const response = await internals.fetcher(`${AV_ENDPOINT}?${search}`, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`upstream_${response.status}`);
    const payload = await response.json();
    const errKey = errorKey(payload);
    if (errKey) throw new Error(`av_${errKey}`);

    const fetchedAt = now.toISOString();
    const entry = { fetchedAt, payload };
    memoryCache.set(file, entry);
    writeCacheFile(file, entry);
    writeQuota(dir, readQuota(dir) + 1);
    return { data: payload, fetchedAt, stale: false, error: null };
  } catch (error) {
    // 4. Live call failed: serve the stale copy with its OLD fetchedAt.
    const reason = error?.name === 'AbortError' ? 'upstream_timeout' : shortReason(error?.message);
    if (cached) {
      return { data: structuredClone(cached.payload), fetchedAt: cached.fetchedAt, stale: true, error: reason };
    }
    return { data: null, fetchedAt: null, stale: false, error: reason };
  } finally {
    clearTimeout(timeout);
  }
}

// Test-only reset: point the cache dir at a temp directory, inject a fake
// fetch/clock, and clear the in-memory layer between tests.
export function resetCacheForTests({ dir, clock, fetcher } = {}) {
  memoryCache.clear();
  if (dir !== undefined) process.env.AV_CACHE_DIR = dir;
  if (clock) internals.clock = clock;
  if (fetcher) internals.fetcher = fetcher;
}
