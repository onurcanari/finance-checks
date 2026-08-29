'use client';

import { useEffect, useState } from 'react';
import { Header, percent } from '../components';
import { ALERTS, evaluateAlert } from '../lib/alerts';

const currentText = (rule, current) => rule.kind === 'usdtry' ? (Number.isFinite(current) ? current.toFixed(2) : '-') : percent(current);
const thresholdText = (rule) => `${rule.op === 'gt' ? '>' : '<'} ${rule.kind === 'usdtry' ? rule.value.toFixed(2) : percent(rule.value)}`;

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}

export default function AlertsPage() {
  const [snapshot, setSnapshot] = useState();
  const [fx, setFx] = useState();
  const [status, setStatus] = useState('CONNECTING...');
  const load = async () => {
    setStatus('FETCHING LIVE PRICES...');
    const [snapshotResult, fxResult] = await Promise.allSettled([fetchJson('/api/market-snapshot'), fetchJson('/api/exchange-rate')]);
    if (snapshotResult.status === 'fulfilled') setSnapshot(snapshotResult.value);
    if (fxResult.status === 'fulfilled') setFx(fxResult.value);
    setStatus(`LIVE · ${new Date().toLocaleTimeString('en-US')}`);
  };
  useEffect(() => { load(); }, []);

  const tickerMap = new Map();
  if (snapshot) for (const quote of [...snapshot.sectors, ...snapshot.assets, ...snapshot.themes]) if (quote?.ticker && !tickerMap.has(quote.ticker)) tickerMap.set(quote.ticker, quote);
  const rows = ALERTS.map((rule) => {
    const quote = rule.kind === 'usdtry' ? fx?.rate : tickerMap.get(rule.symbol);
    const current = rule.kind === 'usdtry' ? quote : quote?.[rule.metric];
    return { rule, current, triggered: evaluateAlert(rule, quote) };
  });
  const triggered = rows.filter((row) => row.triggered).length;
  const hasData = Boolean(snapshot || fx);

  return <main className="shell"><Header active="ALERTS" stamp="ALERT THRESHOLDS / LIVE EVALUATION" />
    <section className="panel alert-summary"><div className="panel-title">ALERT STATUS <span className="stamp">CLIENT-SIDE EVALUATION</span></div><div className="alert-summary-body"><div className={`signal ${!hasData ? '' : triggered ? 'down' : 'up'}`}>{!hasData ? 'LIVE DATA UNAVAILABLE' : triggered ? `${triggered} / ${ALERTS.length} ALERTS TRIGGERED` : 'ALL CLEAR'}</div><div className="stamp">thresholds defined in app/lib/alerts.js</div></div></section>
    <section className="panel alert-board"><div className="panel-title">THRESHOLD RULES <span className="stamp">SNAPSHOT + EXCHANGE RATE</span></div><div className="table-wrap"><table><thead><tr><th>STATUS</th><th>RULE</th><th>CURRENT</th><th>THRESHOLD</th></tr></thead><tbody>{rows.map(({ rule, current, triggered: fired }) => <tr key={rule.label} className={fired ? 'down' : ''}><td><span className={fired ? 'alert-blink' : ''} aria-hidden="true">●</span> {fired ? 'ALARM' : 'OK'}</td><td>{rule.label}</td><td>{currentText(rule, current)}</td><td>{thresholdText(rule)}</td></tr>)}</tbody></table></div></section>
    <div className="status"><span><b className="up">●</b> ALERT THRESHOLDS</span><span>{status}</span><button onClick={load}>REFRESH</button></div><p className="foot">RULES EVALUATED CLIENT-SIDE AGAINST LIVE DATA. NO PERSISTED STATE.</p>
  </main>;
}
