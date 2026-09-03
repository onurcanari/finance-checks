import { NextResponse } from 'next/server';
import { PORTFOLIO } from '../../lib/portfolio';
import { isHttpLink } from '../../lib/links';

const SYMBOL_PATTERN = /^[A-Za-z0-9^][A-Za-z0-9.^_=-]{0,31}$/;

async function fetchSymbolNews(symbol) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=0`, {
      signal: controller.signal,
      headers: { Referer: 'https://finance.yahoo.com/' },
      next: { revalidate: 600 },
    });
    if (!response.ok) throw new Error(`${symbol}: ${response.status}`);
    const payload = await response.json();
    return (Array.isArray(payload.news) ? payload.news : [])
      // Yahoo falls back to unrelated trending stories when a symbol has no tagged
      // coverage (e.g. crypto pairs, indices) — only keep items actually about it.
      .filter((item) => item.title && isHttpLink(item.link) && item.providerPublishTime && item.relatedTickers?.includes(symbol))
      .map((item) => ({
        symbol,
        title: item.title,
        link: item.link,
        source: item.publisher || 'Yahoo Finance',
        publishedAt: new Date(item.providerPublishTime * 1000).toISOString(),
      }));
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
  const results = await Promise.allSettled(uniqueSymbols.map(fetchSymbolNews));

  if (results.every((result) => result.status === 'rejected')) {
    return NextResponse.json({ error: 'Stock news is unavailable.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }

  const items = results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value)
    .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
    .slice(0, 40);

  return NextResponse.json(
    { items, updatedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  );
}
