// PORTFOLIO HOLDINGS — edit this file to match real holdings.
// Each entry: { symbol, name, quantity, category }.
// symbol   = Yahoo Finance symbol (e.g. 'SPY', 'BTC-USD', '^XU100').
// name     = display label used across the portfolio UI.
// quantity = number of units held (VALUE = price x quantity).
// category = 'EQUITY' | 'GOLD' | 'CRYPTO' | 'INDEX'.
export const PORTFOLIO = [
  { symbol: 'SPY', name: 'S&P 500', quantity: 1, category: 'EQUITY' },
  { symbol: 'QQQ', name: 'Nasdaq 100', quantity: 1, category: 'EQUITY' },
  { symbol: 'SOXX', name: 'Semiconductors', quantity: 1, category: 'EQUITY' },
  { symbol: 'GLD', name: 'Gold', quantity: 1, category: 'GOLD' },
  { symbol: 'BTC-USD', name: 'Bitcoin', quantity: 1, category: 'CRYPTO' },
  { symbol: '^XU100', name: 'BIST 100', quantity: 1, category: 'INDEX' },
];