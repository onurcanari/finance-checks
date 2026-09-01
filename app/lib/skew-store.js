// Tiny JSON-file snapshot store for daily skew points.
//
// Layout: <SKEW_STORE_DIR || <cwd>/.skew-store>/<TICKER>.json
//   { history: [{ date: 'YYYY-MM-DD', skew, atmIV, putIV, callIV }] }
//
// upsertToday() writes at most one entry per date — a same-day recompute
// overwrites that day's point. weeklyChange() compares the latest skew with
// the newest entry at least 5 days older. The dir is gitignored; local tests
// point it at a temp dir via SKEW_STORE_DIR / setStoreDirForTests.

import fs from 'node:fs';
import path from 'node:path';

const DAY_MS = 86_400_000;
const WEEKLY_LOOKBACK_DAYS = 5;

function storeDir() {
  return process.env.SKEW_STORE_DIR || path.join(process.cwd(), '.skew-store');
}

function tickerFile(ticker) {
  return path.join(storeDir(), `${String(ticker).toUpperCase()}.json`);
}

function sanitizePoint(point) {
  const skew = Number(point?.skew);
  const atmIV = Number(point?.atmIV);
  const putIV = Number(point?.putIV);
  const callIV = Number(point?.callIV);
  if (![skew, atmIV, putIV, callIV].every(Number.isFinite)) return null;
  return { skew, atmIV, putIV, callIV };
}

function readHistory(ticker) {
  try {
    const parsed = JSON.parse(fs.readFileSync(tickerFile(ticker), 'utf8'));
    const history = Array.isArray(parsed?.history) ? parsed.history : [];
    return history.filter((entry) => entry && typeof entry.date === 'string' && sanitizePoint(entry));
  } catch {
    // Missing or unreadable file = empty history (first write creates it).
    return [];
  }
}

function writeHistory(ticker, history) {
  fs.mkdirSync(storeDir(), { recursive: true });
  const tmp = `${tickerFile(ticker)}.tmp`;
  // Write-then-rename keeps a crash mid-write from corrupting the JSON file.
  fs.writeFileSync(tmp, JSON.stringify({ history }));
  fs.renameSync(tmp, tickerFile(ticker));
}

function todayIso(clock) {
  const now = clock ? new Date(clock()) : new Date();
  return now.toISOString().slice(0, 10);
}

export function upsertToday(ticker, point, clock) {
  const clean = sanitizePoint(point);
  if (!clean) return null;
  const date = todayIso(clock);
  const history = readHistory(ticker).filter((entry) => entry.date !== date);
  history.push({ date, ...clean });
  history.sort((a, b) => a.date.localeCompare(b.date));
  writeHistory(ticker, history);
  return { date, ...clean };
}

// latest skew − skew of the newest entry ≥5 days older; null when the history
// has fewer than 2 points (or no entry old enough).
export function weeklyChange(ticker, clock) {
  const history = readHistory(ticker);
  if (history.length < 2) return null;
  const now = clock ? new Date(clock()) : new Date();
  const cutoff = now.getTime() - WEEKLY_LOOKBACK_DAYS * DAY_MS;

  let latest = null;
  for (const entry of history) {
    if (!latest || entry.date > latest.date) latest = entry;
  }
  let baseline = null;
  for (const entry of history) {
    const age = Date.parse(`${entry.date}T00:00:00Z`);
    if (!Number.isFinite(age) || age > cutoff) continue;
    if (!baseline || entry.date > baseline.date) baseline = entry;
  }
  if (!latest || !baseline) return null;
  return latest.skew - baseline.skew;
}

// Latest stored point per ticker (for GET /api/skew?history=1). Returns null
// when nothing is stored yet — the page renders an empty state, never a guess.
export function latestSnapshot(ticker) {
  const history = readHistory(ticker);
  if (!history.length) return null;
  return history[history.length - 1];
}

export function setStoreDirForTests(dir) {
  process.env.SKEW_STORE_DIR = dir;
}
