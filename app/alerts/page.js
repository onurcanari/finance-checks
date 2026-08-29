'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header, percent } from '../components';
import { ALERTS, evaluateAlert } from '../lib/alerts';

const currentText = (rule, current) => rule.kind === 'usdtry' ? (Number.isFinite(current) ? current.toFixed(2) : '-') : percent(current);
const thresholdText = (rule) => `${rule.op === 'gt' ? '>' : '<'} ${rule.kind === 'usdtry' ? rule.value.toFixed(2) : percent(rule.value)}`;

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (typeof data?.error === 'string') detail = data.error;
    } catch (_) {
      // Non-JSON or empty error body; fall back to the generic HTTP detail.
    }
    throw Error(detail);
  }
  return response.json();
}

// A rule is only "evaluated" when its own data source is actually available:
// market rules need a matching, finite quote from the snapshot; the usdtry
// rule needs a finite rate from the exchange-rate endpoint. Unevaluated rules
// must never masquerade as OK or count toward an all-clear signal.
function isEvaluated(rule, quote) {
  if (rule.kind === 'usdtry') return Number.isFinite(quote);
  return Boolean(quote && Number.isFinite(quote[rule.metric]));
}

export default function AlertsPage() {
  const [snapshot, setSnapshot] = useState();
  const [fx, setFx] = useState();
  const [status, setStatus] = useState('CONNECTING...');
  const load = useCallback(async () => {
    setStatus('FETCHING LIVE PRICES...');
    const [snapshotResult, fxResult] = await Promise.allSettled([fetchJson('/api/market-snapshot'), fetchJson('/api/exchange-rate')]);
    if (snapshotResult.status === 'fulfilled') setSnapshot(snapshotResult.value);
    if (fxResult.status === 'fulfilled') setFx(fxResult.value);
    setStatus(snapshotResult.status === 'fulfilled' || fxResult.status === 'fulfilled'
      ? `LIVE · ${new Date().toLocaleTimeString('en-US')}`
      : 'LIVE DATA UNAVAILABLE');
  }, []);
  useEffect(() => { load(); }, [load]);

  const tickerMap = useMemo(() => {
    const map = new Map();
    if (snapshot) for (const quote of [...snapshot.sectors, ...snapshot.assets, ...snapshot.themes]) if (quote?.ticker && !map.has(quote.ticker)) map.set(quote.ticker, quote);
    return map;
  }, [snapshot]);

  const rows = useMemo(() => ALERTS.map((rule) => {
    const quote = rule.kind === 'usdtry' ? fx?.rate : tickerMap.get(rule.symbol);
    const current = rule.kind === 'usdtry' ? quote : quote?.[rule.metric];
    const evaluated = isEvaluated(rule, quote);
    return { rule, current, evaluated, triggered: evaluated && evaluateAlert(rule, quote) };
  }), [fx, tickerMap]);

  const evaluatedCount = rows.filter((row) => row.evaluated).length;
  const triggered = rows.filter((row) => row.triggered).length;
  const allEvaluated = evaluatedCount === ALERTS.length;

  return <main className="shell"><Header active="ALERTS" stamp="ALERT THRESHOLDS / LIVE EVALUATION" />
    <section className="panel alert-summary"><div className="panel-title">ALERT STATUS <span className="stamp">CLIENT-SIDE EVALUATION</span></div><div className="alert-summary-body"><div className={`signal ${allEvaluated ? triggered ? 'down' : 'up' : ''}`}>{allEvaluated ? (triggered ? `${triggered} / ${ALERTS.length} ALERTS TRIGGERED` : 'ALL CLEAR') : `${ALERTS.length - evaluatedCount} / ${ALERTS.length} RULES UNAVAILABLE`}</div><div className="stamp">thresholds defined in app/lib/alerts.js</div></div></section>
    <section className="panel alert-board"><div className="panel-title">THRESHOLD RULES <span className="stamp">SNAPSHOT + EXCHANGE RATE</span></div><div className="table-wrap"><table><thead><tr><th>STATUS</th><th>RULE</th><th>CURRENT</th><th>THRESHOLD</th></tr></thead><tbody>{rows.map(({ rule, current, evaluated, triggered: fired }) => <tr key={rule.label} className={fired ? 'down' : ''}><td><span className={fired ? 'alert-blink' : ''} aria-hidden="true">●</span> {evaluated ? (fired ? 'ALARM' : 'OK') : 'N/A'}</td><td>{rule.label}</td><td>{currentText(rule, current)}</td><td>{thresholdText(rule)}</td></tr>)}</tbody></table></div></section>
    <div className="status"><span><b className="up">●</b> ALERT THRESHOLDS</span><span>{status}</span><button onClick={load}>REFRESH</button></div><p className="foot">RULES EVALUATED CLIENT-SIDE AGAINST LIVE DATA. NO PERSISTED STATE.</p>
  </main>;
}