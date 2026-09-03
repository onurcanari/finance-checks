import { NextResponse } from 'next/server';
import { PORTFOLIO } from '../../lib/portfolio';

const SYMBOL_PATTERN = /^[A-Za-z0-9^][A-Za-z0-9.^_=-]{0,31}$/;
const UA = 'Mozilla/5.0 (compatible; SectorFlowMonitor/1.0)';

// Yahoo's quoteSummary endpoint requires a session cookie + crumb (no API key).
// Cached at module scope so a warm serverless instance reuses it across requests.
let crumbCache = null;

async function fetchCrumb() {
  const cookieResponse = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, cache: 'no-store' });
  const cookie = (cookieResponse.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('no Yahoo session cookie');
  const crumbResponse = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'User-Agent': UA, Cookie: cookie },
    cache: 'no-store',
  });
  const crumb = (await crumbResponse.text()).trim();
  if (!crumb || crumb.length > 20) throw new Error('crumb fetch failed');
  return { cookie, crumb };
}

async function getCrumb(forceRefresh) {
  if (!forceRefresh && crumbCache) return crumbCache;
  crumbCache = await fetchCrumb();
  return crumbCache;
}

function toEvents(symbol, calendarEvents) {
  const events = [];
  const earningsDates = calendarEvents?.earnings?.earningsDate;
  if (Array.isArray(earningsDates)) {
    earningsDates.forEach((entry) => entry?.fmt && events.push({ symbol, date: entry.fmt, event: 'Earnings', importance: 'HIGH' }));
  }
  if (calendarEvents?.exDividendDate?.fmt) events.push({ symbol, date: calendarEvents.exDividendDate.fmt, event: 'Ex-Dividend Date', importance: 'LOW' });
  if (calendarEvents?.dividendDate?.fmt) events.push({ symbol, date: calendarEvents.dividendDate.fmt, event: 'Dividend Payment', importance: 'LOW' });
  return events;
}

async function fetchSymbolCalendar(symbol, auth) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents&crumb=${encodeURIComponent(auth.crumb)}`,
      { signal: controller.signal, headers: { 'User-Agent': UA, Cookie: auth.cookie }, next: { revalidate: 3600 } },
    );
    const payload = await response.json();
    if (payload?.quoteSummary?.error?.code === 'Unauthorized') throw new Error('unauthorized');
    return toEvents(symbol, payload?.quoteSummary?.result?.[0]?.calendarEvents);
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request) {
  const raw = request.nextUrl.searchParams.get('symbols');
  const symbols = raw ? raw.split(',').map((symbol) => symbol.trim()) : PORTFOLIO.map(({ symbol }) => symbol);
  if (!symbols.length || symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol))) {
    return NextResponse.json({ error: 'symbols must be a comma-separated list of valid Yahoo symbols' }, { status: 400 });
  }
  const uniqueSymbols = [...new Set(symbols)];

  let auth;
  try {
    auth = await getCrumb(false);
  } catch {
    return NextResponse.json({ events: [], updatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let results = await Promise.allSettled(uniqueSymbols.map((symbol) => fetchSymbolCalendar(symbol, auth)));
  if (results.every((result) => result.status === 'rejected')) {
    try {
      auth = await getCrumb(true);
      results = await Promise.allSettled(uniqueSymbols.map((symbol) => fetchSymbolCalendar(symbol, auth)));
    } catch {
      // Yahoo's session flow is unreachable right now; report no events rather than an error.
    }
  }

  const events = results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json(
    { events, updatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=21600' } },
  );
}
