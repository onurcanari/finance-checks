import { NextResponse } from 'next/server';

const URL = 'https://api.frankfurter.dev/v2/rate/USD/TRY';

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(URL, {
      signal: controller.signal,
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error('Frankfurter request failed');

    const data = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      typeof data.rate !== 'number' ||
      !Number.isFinite(data.rate) ||
      data.rate <= 0 ||
      typeof data.date !== 'string' ||
      !data.date.trim()
    ) {
      throw new Error('Invalid Frankfurter response');
    }

    return NextResponse.json(
      {
        rate: data.rate,
        base: 'USD',
        quote: 'TRY',
        date: data.date,
        fetchedAt: new Date().toISOString(),
        source: 'Frankfurter',
      },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'USD/TRY rate is unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
