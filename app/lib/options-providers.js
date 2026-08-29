// Options chain provider abstraction.
//
// The first registered provider is Tradier (free developer tier). Additional
// providers can be added by extending the PROVIDERS registry below; each must
// expose {name, getExpirations, getChain, getUnderlyingQuote}.
//
// The module also enforces a 60-requests-per-minute in-memory rate limiter
// across all upstream calls so the route layer cannot accidentally exhaust
// the upstream quota. The limiter is process-local and best-effort — it does
// not coordinate across replicas.

const TRADIER_BASE = ['https', '://', 'api', '.', 'tradier', '.', 'com'].join('');
const FETCH_TIMEOUT_MS = 10_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const MAX_EXPIRATIONS = 8;

const recentRequests = [];

function pruneRateLimit(now) {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (recentRequests.length && recentRequests[0] <= cutoff) {
    recentRequests.shift();
  }
}

function checkRateLimit(now) {
  pruneRateLimit(now);
  if (recentRequests.length >= RATE_LIMIT_MAX) {
    const error = new Error('local_rate_limited');
    error.retryAfter = 60;
    throw error;
  }
}

function recordRateLimit(now) {
  recentRequests.push(now);
}

export function _resetRateLimiter() {
  recentRequests.length = 0;
}

function authHeaders(apiKey) {
  return {
    Authorization: 'Bearer ' + apiKey,
    Accept: 'application/json',
  };
}

async function tradierFetch(path, apiKey) {
  const now = Date.now();
  checkRateLimit(now);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const url = TRADIER_BASE + path;

  let response;
  try {
    response = await fetch(url, {
      headers: authHeaders(apiKey),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    const wrapped = new Error('fetch_failed');
    wrapped.cause = error;
    throw wrapped;
  }
  clearTimeout(timeout);

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '60', 10);
    const error = new Error('rate_limited');
    error.retryAfter = Number.isFinite(retryAfter) ? retryAfter : 60;
    throw error;
  }

  if (!response.ok) {
    throw new Error('upstream:' + response.status);
  }

  // Only count successful requests against the quota.
  recordRateLimit(Date.now());
  return response.json();
}

function normalizeExpirationDate(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    return null;
  }
  if (value && typeof value === 'object') {
    const candidate = value.date || value.expiration || value.expiration_date;
    if (typeof candidate === 'string') return normalizeExpirationDate(candidate);
  }
  return null;
}

function isThirdFriday(year, month, day) {
  // month is 0-indexed
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() !== 5) return false;
  return day >= 15 && day <= 21;
}

function isMonthlyExpiration(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return false;
  return isThirdFriday(y, m - 1, d);
}

function dedupeAndSort(expirations) {
  const seen = new Set();
  const unique = [];
  for (const date of expirations) {
    if (typeof date !== 'string' || seen.has(date)) continue;
    seen.add(date);
    unique.push(date);
  }
  unique.sort();
  return unique;
}

function createTradierProvider() {
  const apiKey = process.env.TRADIER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('TRADIER_API_KEY missing');
  }

  async function getExpirations(symbol) {
    const data = await tradierFetch(
      '/v1/markets/options/expirations?symbol=' + encodeURIComponent(symbol),
      apiKey,
    );
    const raw = data?.expirations;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const normalized = list
      .map(normalizeExpirationDate)
      .filter((value) => typeof value === 'string');
    const unique = dedupeAndSort(normalized);

    if (unique.length === 0) return [];

    const monthlies = unique.filter(isMonthlyExpiration);
    const weeklies = unique.filter((date) => !isMonthlyExpiration(date));
    // Monthlies first (ascending), then weeklies (ascending) — cap total at MAX_EXPIRATIONS.
    return [...monthlies, ...weeklies].slice(0, MAX_EXPIRATIONS);
  }

  function normalizeOption(option) {
    const greeks = option?.greeks || {};
    return {
      symbol: option?.symbol ?? null,
      strike: option?.strike ?? null,
      bid: option?.bid ?? null,
      ask: option?.ask ?? null,
      last: option?.last ?? null,
      iv: greeks?.mid_iv ?? null,
      delta: greeks?.delta ?? null,
      gamma: greeks?.gamma ?? null,
      theta: greeks?.theta ?? null,
      vega: greeks?.vega ?? null,
      volume: option?.volume ?? null,
      openInterest: option?.open_interest ?? null,
      inTheMoney: Boolean(option?.in_the_money),
    };
  }

  async function getChain(symbol, expiration) {
    const path =
      '/v1/markets/options/chains?symbol=' +
      encodeURIComponent(symbol) +
      '&expiration=' +
      encodeURIComponent(expiration) +
      '&greeks=true';
    const data = await tradierFetch(path, apiKey);
    const raw = data?.options?.option;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

    const calls = [];
    const puts = [];
    for (const option of list) {
      if (!option) continue;
      const normalized = normalizeOption(option);
      const type = (option.option_type || '').toLowerCase();
      if (type === 'call') calls.push(normalized);
      else if (type === 'put') puts.push(normalized);
    }

    return { spot: null, calls, puts };
  }

  async function getUnderlyingQuote(symbol) {
    const data = await tradierFetch(
      '/v1/markets/quotes?symbols=' + encodeURIComponent(symbol),
      apiKey,
    );
    const raw = data?.quotes?.quote;
    const quote = Array.isArray(raw) ? raw[0] : raw;
    if (!quote) {
      throw new Error('fetch_failed');
    }
    return {
      price: quote.last ?? quote.close ?? null,
      prevClose: quote.prevclose ?? quote.previous_close ?? null,
      currency: 'USD',
    };
  }

  return {
    name: 'tradier',
    getExpirations,
    getChain,
    getUnderlyingQuote,
  };
}

const PROVIDERS = {
  tradier: createTradierProvider,
};

export function getProvider(name) {
  const factory = PROVIDERS[name];
  if (!factory) {
    throw new Error('unknown_provider:' + name);
  }
  return factory();
}