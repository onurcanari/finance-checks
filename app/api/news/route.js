import { NextResponse } from 'next/server';

const FEEDS = [
  { source: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
  { source: 'YAHOO', url: 'https://finance.yahoo.com/news/rssindex' },
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function unwrapTag(value) {
  return decodeEntities(value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim());
}

function pickField(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? unwrapTag(match[1]) : '';
}

// Minimal RSS parser: no dependencies, only the three fields the page needs.
function parseFeed(xml) {
  return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/gi)]
    .slice(0, 6)
    .map(([, block]) => {
      const title = pickField(block, 'title');
      const link = pickField(block, 'link');
      const published = new Date(pickField(block, 'pubDate'));
      return { title, link, publishedAt: Number.isNaN(published.getTime()) ? null : published.toISOString() };
    })
    // Only allow http(s) links through to the client; other schemes are dropped.
    .filter((item) => item.title && item.link && /^https?:\/\//i.test(item.link));
}

async function fetchFeed(feed) {
  // Per-feed controller + timeout so one slow feed can't abort the other.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(feed.url, {
      signal: controller.signal,
      next: { revalidate: 600 },
    });
    if (!response.ok) throw new Error(`${feed.source} request failed`);
    const items = parseFeed(await response.text());
    if (!items.length) throw new Error(`${feed.source} feed was empty`);
    return items.map((item) => ({ ...item, source: feed.source }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  try {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));

    if (results.every((result) => result.status === 'rejected')) {
      return NextResponse.json(
        { error: 'News feeds are unavailable.' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const items = results
      .filter((result) => result.status === 'fulfilled')
      .flatMap((result) => result.value)
      .sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0))
      .slice(0, 10);

    return NextResponse.json(
      { items, updatedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'News feeds are unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
