// Alert threshold rules. Market rules evaluate against /api/market-snapshot
// quotes (metric oneDay / fiveDay are percent returns); the usdtry rule
// evaluates against the rate returned by /api/exchange-rate. Only symbols the
// snapshot actually returns may be used.
export const ALERTS = [
  { symbol: 'SPY', metric: 'oneDay', op: 'lt', value: -1.5, label: 'SPY sharp drop' },
  { symbol: 'XLK', metric: 'oneDay', op: 'lt', value: -2, label: 'Technology sharp drop' },
  { symbol: 'SMH', metric: 'oneDay', op: 'lt', value: -3, label: 'Semiconductors sharp drop' },
  { symbol: 'GLD', metric: 'fiveDay', op: 'gt', value: 3, label: 'Gold surge (5d)' },
  { symbol: 'USO', metric: 'fiveDay', op: 'gt', value: 5, label: 'Oil spike (5d)' },
  { symbol: 'TLT', metric: 'oneDay', op: 'lt', value: -1.5, label: 'Bonds sell-off' },
  { kind: 'usdtry', op: 'gt', value: 50, label: 'USD/TRY above 50' },
];

const compare = (op, left, right) => op === 'gt' ? left > right : left < right;

export function evaluateAlert(rule, quote) {
  if (!rule) return false;
  if (rule.kind === 'usdtry') {
    return Number.isFinite(quote) ? compare(rule.op, quote, rule.value) : false;
  }
  const current = quote?.[rule.metric];
  return Number.isFinite(current) ? compare(rule.op, current, rule.value) : false;
}
